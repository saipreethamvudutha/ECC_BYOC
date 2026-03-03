import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { CAPABILITIES } from "@/lib/capabilities";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check read permission
  const canView = await rbac.checkCapability(session.id, session.tenantId, "admin.role.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden: missing admin.role.view capability" }, { status: 403 });
  }

  const roles = await prisma.role.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "asc" },
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

  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      isBuiltin: r.isBuiltin,
      isActive: r.isActive,
      maxAssignments: r.maxAssignments,
      capabilityCount: r._count.roleCapabilities,
      totalCapabilities: CAPABILITIES.length,
      userCount: r._count.userRoles,
      createdBy: r.createdBy?.name || "System",
      createdAt: r.createdAt.toISOString(),
    }))
  );
}

/**
 * POST /api/roles — Create a new custom role
 *
 * Body: { name, slug, description?, capabilities: string[], parentRoleId? }
 * Requires: admin.role.manage
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "admin.role.manage");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden: missing admin.role.manage capability" }, { status: 403 });
  }

  let body: {
    name?: string;
    slug?: string;
    description?: string;
    capabilities?: string[];
    parentRoleId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, slug, description, capabilities, parentRoleId } = body;

  // --- Validation ---
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
    return NextResponse.json({ error: "Role slug is required" }, { status: 400 });
  }

  // Validate slug format: lowercase alphanumeric + hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase alphanumeric with hyphens (e.g. 'custom-analyst')" },
      { status: 400 }
    );
  }

  // Check slug uniqueness within tenant
  const existing = await prisma.role.findUnique({
    where: { tenantId_slug: { tenantId: session.tenantId, slug } },
  });
  if (existing) {
    return NextResponse.json({ error: `A role with slug '${slug}' already exists` }, { status: 409 });
  }

  // Validate capabilities
  if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0) {
    return NextResponse.json({ error: "At least one capability is required" }, { status: 400 });
  }

  const validCapabilityIds = new Set(CAPABILITIES.map((c) => c.id));
  const invalidCaps = capabilities.filter((c) => !validCapabilityIds.has(c));
  if (invalidCaps.length > 0) {
    return NextResponse.json(
      { error: `Invalid capabilities: ${invalidCaps.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate parent role if provided
  if (parentRoleId) {
    const parentRole = await prisma.role.findFirst({
      where: { id: parentRoleId, tenantId: session.tenantId },
    });
    if (!parentRole) {
      return NextResponse.json({ error: "Parent role not found" }, { status: 400 });
    }
  }

  // --- Create role + capabilities in a transaction ---
  const role = await prisma.$transaction(async (tx) => {
    const newRole = await tx.role.create({
      data: {
        tenantId: session.tenantId,
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || null,
        isBuiltin: false,
        isActive: true,
        parentRoleId: parentRoleId || null,
        createdById: session.id,
      },
    });

    // Create RoleCapability entries
    await tx.roleCapability.createMany({
      data: capabilities.map((capId) => ({
        roleId: newRole.id,
        capabilityId: capId,
        granted: true,
      })),
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: session.id,
        actorType: "user",
        action: "role.created",
        resourceType: "role",
        resourceId: newRole.id,
        result: "success",
        details: JSON.stringify({
          name: newRole.name,
          slug: newRole.slug,
          capabilityCount: capabilities.length,
          parentRoleId: parentRoleId || null,
        }),
      },
    });

    return newRole;
  });

  // Invalidate RBAC cache for the tenant
  rbac.invalidateCache(session.tenantId);

  // Return the created role with capability count
  return NextResponse.json(
    {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      isBuiltin: role.isBuiltin,
      isActive: role.isActive,
      parentRoleId: role.parentRoleId,
      capabilityCount: capabilities.length,
      totalCapabilities: CAPABILITIES.length,
      createdBy: session.name,
      createdAt: role.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
