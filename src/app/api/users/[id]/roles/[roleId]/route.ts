import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * DELETE /api/users/[id]/roles/[roleId]
 *
 * Remove a role assignment from a user.
 * Requires: admin.role.manage capability.
 *
 * Safeguards:
 * - Cannot remove the last role from a user (every user must have at least one role).
 * - Verifies target user belongs to the same tenant.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkCapability(
    session.id, session.tenantId, "admin.role.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id, roleId } = await params;

  // Verify target user belongs to same tenant
  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Find the specific UserRole entry for this user + role combination
  const userRole = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: id, roleId } },
    include: {
      role: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!userRole) {
    return NextResponse.json(
      { error: "Role assignment not found" },
      { status: 404 }
    );
  }

  // Cannot remove the last role from a user
  const roleCount = await prisma.userRole.count({
    where: { userId: id },
  });

  if (roleCount <= 1) {
    return NextResponse.json(
      { error: "Cannot remove the last role from a user. Every user must have at least one role." },
      { status: 400 }
    );
  }

  // Delete the role assignment
  await prisma.userRole.delete({
    where: { userId_roleId: { userId: id, roleId } },
  });

  // Invalidate RBAC cache so removed capabilities take effect immediately
  rbac.invalidateCache(session.tenantId, id);

  // Audit log
  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "role.removed",
    resourceType: "user",
    resourceId: id,
    result: "success",
    details: {
      roleId,
      roleName: userRole.role.name,
      roleSlug: userRole.role.slug,
      userId: id,
      userName: targetUser.name,
    },
    request,
  });

  return NextResponse.json({ success: true });
}
