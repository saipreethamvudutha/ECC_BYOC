import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

/**
 * DELETE /api/users/[id]/scopes/[scopeId]
 *
 * Remove a scope assignment from a user.
 * Requires: admin.user.manage capability.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "admin.user.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id, scopeId } = await params;

  // Verify user belongs to same tenant
  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Find the user scope assignment
  const userScope = await prisma.userScope.findUnique({
    where: { userId_scopeId: { userId: id, scopeId } },
    include: { scope: true },
  });

  if (!userScope) {
    return NextResponse.json(
      { error: "Scope assignment not found" },
      { status: 404 }
    );
  }

  await prisma.userScope.delete({
    where: { userId_scopeId: { userId: id, scopeId } },
  });

  rbac.invalidateCache(session.tenantId, id);

  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "scope.removed",
      resourceType: "user",
      resourceId: id,
      result: "success",
      details: JSON.stringify({
        scopeId,
        scopeName: userScope.scope.name,
        userName: targetUser.name,
      }),
    },
  });

  return NextResponse.json({ success: true });
}
