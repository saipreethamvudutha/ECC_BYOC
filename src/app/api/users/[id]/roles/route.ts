import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { v4 as uuid } from "uuid";

/**
 * GET /api/users/[id]/roles
 *
 * List all roles assigned to a specific user.
 * Requires: admin.user.view capability.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "admin.user.view"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;

  // Verify user belongs to same tenant
  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true, email: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userRoles = await prisma.userRole.findMany({
    where: { userId: id },
    include: {
      role: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isBuiltin: true,
          isActive: true,
          maxAssignments: true,
        },
      },
      assigner: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  return NextResponse.json({
    user: { id: targetUser.id, name: targetUser.name, email: targetUser.email },
    roles: userRoles.map((ur) => ({
      userRoleId: ur.id,
      roleId: ur.role.id,
      name: ur.role.name,
      slug: ur.role.slug,
      description: ur.role.description,
      isBuiltin: ur.role.isBuiltin,
      isActive: ur.role.isActive,
      maxAssignments: ur.role.maxAssignments,
      assignedBy: ur.assigner
        ? { id: ur.assigner.id, name: ur.assigner.name, email: ur.assigner.email }
        : null,
      assignedAt: ur.assignedAt.toISOString(),
      expiresAt: ur.expiresAt?.toISOString() || null,
    })),
  });
}

/**
 * POST /api/users/[id]/roles
 *
 * Assign a role to a user.
 * Requires: admin.role.manage capability.
 *
 * Body: { roleId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "admin.role.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { roleId } = body as { roleId?: string };

  if (!roleId) {
    return NextResponse.json(
      { error: "roleId is required" },
      { status: 400 }
    );
  }

  // Verify target user belongs to same tenant
  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true, email: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify role belongs to same tenant
  const role = await prisma.role.findFirst({
    where: { id: roleId, tenantId: session.tenantId },
    include: {
      _count: { select: { userRoles: true } },
    },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (!role.isActive) {
    return NextResponse.json(
      { error: "Cannot assign an inactive role" },
      { status: 400 }
    );
  }

  // Check maxAssignments limit (e.g., Platform Admin max 2)
  if (role.maxAssignments !== null && role._count.userRoles >= role.maxAssignments) {
    return NextResponse.json(
      {
        error: `Role "${role.name}" has reached its maximum assignment limit of ${role.maxAssignments}`,
      },
      { status: 400 }
    );
  }

  try {
    const userRole = await prisma.userRole.create({
      data: {
        id: uuid(),
        userId: id,
        roleId,
        assignedBy: session.id,
      },
      include: {
        role: {
          select: { id: true, name: true, slug: true, description: true },
        },
      },
    });

    // Invalidate RBAC cache so the new role takes effect immediately
    rbac.invalidateCache(session.tenantId, id);

    // Audit log
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "role.assigned",
      resourceType: "user",
      resourceId: id,
      result: "success",
      details: {
        roleId,
        roleName: role.name,
        roleSlug: role.slug,
        userId: id,
        userName: targetUser.name,
      },
      request,
    });

    return NextResponse.json(
      {
        userRoleId: userRole.id,
        roleId: userRole.role.id,
        name: userRole.role.name,
        slug: userRole.role.slug,
        description: userRole.role.description,
        assignedAt: userRole.assignedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Role already assigned to this user" },
        { status: 409 }
      );
    }
    throw error;
  }
}
