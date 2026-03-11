import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid asset ID format" }, { status: 400 });
  }

  // Verify asset belongs to tenant
  const asset = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const assetTags = await prisma.assetTag.findMany({
    where: { assetId: id },
    include: { tag: true },
  });

  return NextResponse.json(
    assetTags.map((at) => ({
      id: at.tag.id,
      key: at.tag.key,
      value: at.tag.value,
      color: at.tag.color,
      appliedBy: at.appliedBy,
      appliedAt: at.appliedAt.toISOString(),
    }))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkCapability(session.id, session.tenantId, "asset.edit");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid asset ID format" }, { status: 400 });
  }

  // Verify asset belongs to tenant
  const asset = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = await request.json();
  const { tagIds, key, value } = body;

  // Support both modes: tagIds array OR key/value for direct tag creation
  const resolvedTagIds: string[] = [];

  if (key && value) {
    // Find or create the tag, then assign it
    let tag = await prisma.tag.findFirst({
      where: { tenantId: session.tenantId, key, value },
    });
    if (!tag) {
      tag = await prisma.tag.create({
        data: { tenantId: session.tenantId, key, value },
      });
    }
    resolvedTagIds.push(tag.id);
  } else if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
    resolvedTagIds.push(...tagIds);
  } else {
    return NextResponse.json(
      { error: "Either tagIds array or key/value pair is required" },
      { status: 400 }
    );
  }

  // Upsert each tag assignment (skip duplicates)
  const results = [];
  for (const tagId of resolvedTagIds) {
    // Verify tag belongs to tenant
    const tag = await prisma.tag.findFirst({
      where: { id: tagId, tenantId: session.tenantId },
    });

    if (!tag) continue;

    const assetTag = await prisma.assetTag.upsert({
      where: {
        assetId_tagId: { assetId: id, tagId },
      },
      create: {
        assetId: id,
        tagId,
        appliedBy: "manual",
      },
      update: {},
      include: { tag: true },
    });

    results.push(assetTag);
  }

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "asset.tags.assigned",
    resourceType: "asset",
    resourceId: id,
    result: "success",
    details: { tagIds, assignedCount: results.length },
    request,
  });

  return NextResponse.json(
    results.map((at) => ({
      id: at.tag.id,
      key: at.tag.key,
      value: at.tag.value,
      color: at.tag.color,
      appliedBy: at.appliedBy,
      appliedAt: at.appliedAt.toISOString(),
    })),
    { status: 201 }
  );
}
