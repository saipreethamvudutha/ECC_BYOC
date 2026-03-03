import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { isValidUUID } from "@/lib/validation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  // Verify tag belongs to tenant
  const tag = await prisma.tag.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  // Delete tag (cascade deletes AssetTag entries automatically via schema)
  await prisma.tag.delete({ where: { id } });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "tag.deleted",
    resourceType: "tag",
    resourceId: id,
    result: "success",
    details: { key: tag.key, value: tag.value },
    request,
  });

  return NextResponse.json({ success: true });
}
