import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tags = await prisma.tag.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ key: "asc" }, { value: "asc" }],
    include: {
      _count: { select: { assetTags: true } },
    },
  });

  return NextResponse.json(
    tags.map((t) => ({
      id: t.id,
      key: t.key,
      value: t.value,
      color: t.color,
      assetCount: t._count.assetTags,
      createdAt: t.createdAt.toISOString(),
    }))
  );
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkCapability(
    session.id, session.tenantId, "asset.tag.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { key, value, color } = await request.json();

  if (!key || !value) {
    return NextResponse.json(
      { error: "Key and value are required" },
      { status: 400 }
    );
  }

  try {
    const tag = await prisma.tag.create({
      data: {
        tenantId: session.tenantId,
        key: key.toLowerCase(),
        value,
        color: color || null,
      },
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "tag.created",
      resourceType: "tag",
      resourceId: tag.id,
      result: "success",
      details: { key: tag.key, value: tag.value },
      request,
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Tag already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}
