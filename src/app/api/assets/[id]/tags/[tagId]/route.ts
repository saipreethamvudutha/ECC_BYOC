import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { isValidUUID } from "@/lib/validation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "asset.tag.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id, tagId } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  if (!isValidUUID(tagId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  // Verify asset belongs to tenant
  const asset = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Find the asset-tag association
  const assetTag = await prisma.assetTag.findUnique({
    where: {
      assetId_tagId: { assetId: id, tagId },
    },
    include: { tag: true },
  });

  if (!assetTag) {
    return NextResponse.json(
      { error: "Tag not assigned to this asset" },
      { status: 404 }
    );
  }

  // Delete the asset-tag record
  await prisma.assetTag.delete({
    where: {
      assetId_tagId: { assetId: id, tagId },
    },
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "asset.tag.removed",
    resourceType: "asset",
    resourceId: id,
    result: "success",
    details: {
      tagId,
      key: assetTag.tag.key,
      value: assetTag.tag.value,
    },
    request,
  });

  return NextResponse.json({ success: true });
}
