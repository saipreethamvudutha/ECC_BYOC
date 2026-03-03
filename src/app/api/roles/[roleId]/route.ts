import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { CAPABILITIES, CAPABILITY_MODULES, getCapabilitiesByModule } from "@/lib/capabilities";

type RouteContext = { params: Promise<{ roleId: string }> };

/**
 * GET /api/roles/[roleId] — Single role detail
 *
 * Returns full role with capabilities grouped by module, user list,
 * and all 42 capabilities with granted/denied status.
 * Requires: admin.role.view
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "admin.role.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden: missing admin.role.view capability" }, { status: 403 });
  }

  const { roleId } = await params;

  const role = await prisma.role.findFirst({
    where: { id: roleId, tenantId: session.tenantId },
    include: {
      roleCapabilities: true,
      parentRole: { select: { id: true, name: true, slug: true } },
      childRoles: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      userRoles: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              avatarUrl: true,
              lastLoginAt: true,
            },
          },
        },
      },
    },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  // Build a set of granted and denied capabilities for this role
  const grantedSet = new Set<string>();
  const deniedSet = new Set<string>();
  for (const rc of role.roleCapabilities) {
    if (rc.granted) {
      grantedSet.add(rc.capabilityId);
    } else {
      deniedSet.add(rc.capabilityId);
    }
  }

  // Build capabilities grouped by module, including ALL 42 capabilities
  const capabilitiesByModule = getCapabilitiesByModule();
  const modules = CAPABILITY_MODULES.map((mod) => {
    const caps = capabilitiesByModule[mod.id] || [];
    return {
      id: mod.id,
      name: mod.name,
      icon: mod.icon,
      capabilities: caps.map((cap) => ({
        id: cap.id,
        name: cap.name,
        description: cap.description,
        riskLevel: cap.riskLevel,
        granted: grantedSet.has(cap.id),
        denied: deniedSet.has(cap.id),
      })),
    };
  });

  const grantedCount = grantedSet.size;
  const users = role.userRoles.map((ur) => ({
    id: ur.user.id,
    name: ur.user.name,
    email: ur.user.email,
    status: ur.user.status,
    avatarUrl: ur.user.avatarUrl,
    lastLoginAt: ur.user.lastLoginAt?.toISOString() || null,
    assignedAt: ur.assignedAt.toISOString(),
    expiresAt: ur.expiresAt?.toISOString() || null,
  }));

  return NextResponse.json({
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    isBuiltin: role.isBuiltin,
    isActive: role.isActive,
    maxAssignments: role.maxAssignments,
    parentRole: role.parentRole,
    childRoles: role.childRoles,
    createdBy: role.createdBy
      ? { id: role.createdBy.id, name: role.createdBy.name, email: role.createdBy.email }
      : null,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
    modules,
    grantedCount,
    totalCapabilities: CAPABILITIES.length,
    users,
    userCount: users.length,
  });
}

/**
 * PATCH /api/roles/[roleId] — Update a custom role
 *
 * Body: { name?, description?, capabilities?: string[], isActive? }
 * Cannot modify built-in roles.
 * If capabilities provided, replaces all RoleCapability entries.
 * Requires: admin.role.manage
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "admin.role.manage");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden: missing admin.role.manage capability" }, { status: 403 });
  }

  const { roleId } = await params;

  const role = await prisma.role.findFirst({
    where: { id: roleId, tenantId: session.tenantId },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (role.isBuiltin) {
    return NextResponse.json(
      { error: "Built-in roles cannot be modified. Clone the role to create a customized version." },
      { status: 400 }
    );
  }

  let body: {
    name?: string;
    description?: string;
    capabilities?: string[];
    isActive?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, capabilities, isActive } = body;

  // Validate name if provided
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    return NextResponse.json({ error: "Role name cannot be empty" }, { status: 400 });
  }

  // Validate capabilities if provided
  if (capabilities !== undefined) {
    if (!Array.isArray(capabilities)) {
      return NextResponse.json({ error: "Capabilities must be an array" }, { status: 400 });
    }
    const validCapabilityIds = new Set(CAPABILITIES.map((c) => c.id));
    const invalidCaps = capabilities.filter((c) => !validCapabilityIds.has(c));
    if (invalidCaps.length > 0) {
      return NextResponse.json(
        { error: `Invalid capabilities: ${invalidCaps.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // Build update data
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);

  const changes: string[] = [];

  const updatedRole = await prisma.$transaction(async (tx) => {
    // Update role fields
    if (Object.keys(updateData).length > 0) {
      await tx.role.update({
        where: { id: roleId },
        data: updateData,
      });
      changes.push(...Object.keys(updateData));
    }

    // Replace capabilities if provided
    if (capabilities !== undefined) {
      // Delete existing capability mappings
      await tx.roleCapability.deleteMany({ where: { roleId } });

      // Create new mappings
      if (capabilities.length > 0) {
        await tx.roleCapability.createMany({
          data: capabilities.map((capId) => ({
            roleId,
            capabilityId: capId,
            granted: true,
          })),
        });
      }
      changes.push("capabilities");
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: session.id,
        actorType: "user",
        action: "role.updated",
        resourceType: "role",
        resourceId: roleId,
        result: "success",
        details: JSON.stringify({
          changes,
          name: name || role.name,
          capabilityCount: capabilities?.length,
        }),
      },
    });

    // Fetch updated role
    return tx.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: {
            roleCapabilities: { where: { granted: true } },
            userRoles: true,
          },
        },
        createdBy: { select: { name: true } },
      },
    });
  });

  // Invalidate RBAC cache for the entire tenant (capabilities changed)
  rbac.invalidateCache(session.tenantId);

  if (!updatedRole) {
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }

  return NextResponse.json({
    id: updatedRole.id,
    name: updatedRole.name,
    slug: updatedRole.slug,
    description: updatedRole.description,
    isBuiltin: updatedRole.isBuiltin,
    isActive: updatedRole.isActive,
    capabilityCount: updatedRole._count.roleCapabilities,
    totalCapabilities: CAPABILITIES.length,
    userCount: updatedRole._count.userRoles,
    createdBy: updatedRole.createdBy?.name || "System",
    updatedAt: updatedRole.updatedAt.toISOString(),
  });
}

/**
 * DELETE /api/roles/[roleId] — Delete a custom role
 *
 * Cannot delete built-in roles.
 * Cannot delete if users are still assigned (returns 400 with user count).
 * Requires: admin.role.manage
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "admin.role.manage");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden: missing admin.role.manage capability" }, { status: 403 });
  }

  const { roleId } = await params;

  const role = await prisma.role.findFirst({
    where: { id: roleId, tenantId: session.tenantId },
    include: {
      _count: {
        select: { userRoles: true },
      },
    },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (role.isBuiltin) {
    return NextResponse.json(
      { error: "Built-in roles cannot be deleted" },
      { status: 400 }
    );
  }

  if (role._count.userRoles > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete role: ${role._count.userRoles} user(s) are still assigned. Reassign or remove users first.`,
        userCount: role._count.userRoles,
      },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // Delete role capabilities
    await tx.roleCapability.deleteMany({ where: { roleId } });

    // Delete the role
    await tx.role.delete({ where: { id: roleId } });

    // Audit log
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: session.id,
        actorType: "user",
        action: "role.deleted",
        resourceType: "role",
        resourceId: roleId,
        result: "success",
        details: JSON.stringify({
          name: role.name,
          slug: role.slug,
        }),
      },
    });
  });

  // Invalidate RBAC cache for the tenant
  rbac.invalidateCache(session.tenantId);

  return NextResponse.json({ success: true, message: `Role '${role.name}' deleted` });
}
