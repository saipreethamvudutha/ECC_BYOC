import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * PATCH /api/users/[id]
 *
 * Update a user's profile or status (suspend/reactivate).
 * Requires: admin.user.manage capability.
 *
 * Body: { status?: "active" | "suspended", name?: string, department?: string, phone?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;

  // Verify target user belongs to same tenant
  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      userRoles: {
        include: {
          role: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status, name, department, phone } = body as {
    status?: string;
    name?: string;
    department?: string;
    phone?: string;
  };

  // Validate status value if provided
  if (status !== undefined && status !== "active" && status !== "suspended") {
    return NextResponse.json(
      { error: "Invalid status. Must be 'active' or 'suspended'" },
      { status: 400 }
    );
  }

  // Cannot suspend yourself
  if (status && status !== targetUser.status && session.id === id) {
    return NextResponse.json(
      { error: "Cannot change your own status" },
      { status: 400 }
    );
  }

  // Cannot suspend Platform Admins
  if (status === "suspended") {
    const isPlatformAdmin = targetUser.userRoles.some(
      (ur) => ur.role.slug === "platform-admin"
    );
    if (isPlatformAdmin) {
      return NextResponse.json(
        { error: "Cannot suspend a Platform Administrator" },
        { status: 400 }
      );
    }
  }

  // Build update data — only include fields that were provided
  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (name !== undefined) updateData.name = name;
  if (department !== undefined) updateData.department = department;
  if (phone !== undefined) updateData.phone = phone;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    include: {
      userRoles: {
        include: {
          role: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  // Invalidate RBAC cache on status change (suspended users should lose access)
  if (status && status !== targetUser.status) {
    rbac.invalidateCache(session.tenantId, id);
  }

  // Audit log
  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: status && status !== targetUser.status
      ? `user.${status === "suspended" ? "suspended" : "reactivated"}`
      : "user.updated",
    resourceType: "user",
    resourceId: id,
    result: "success",
    details: {
      userId: id,
      userName: updatedUser.name,
      changes: updateData,
      previousStatus: targetUser.status,
    },
    request,
  });

  return NextResponse.json({
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    status: updatedUser.status,
    department: updatedUser.department,
    phone: updatedUser.phone,
    roles: updatedUser.userRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      slug: ur.role.slug,
    })),
    updatedAt: updatedUser.updatedAt.toISOString(),
  });
}
