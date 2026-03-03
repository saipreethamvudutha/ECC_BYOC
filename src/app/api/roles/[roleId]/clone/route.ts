import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { CAPABILITIES } from "@/lib/capabilities";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/roles/[roleId]/clone — Clone an existing role
 *
 * Body: { name, slug, description? }
 * Copies all capabilities from the source role.
 * Sets isBuiltin: false, parentRoleId: sourceRoleId.
 * Requires: admin.role.manage
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
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

  // Find source role with its capabilities
  const sourceRole = await prisma.role.findFirst({
    where: { id: roleId, tenantId: session.tenantId },
    include: {
      roleCapabilities: true,
    },
  });

  if (!sourceRole) {
    return NextResponse.json({ error: "Source role not found" }, { status: 404 });
  }

  let body: {
    name?: string;
    slug?: string;
    description?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, slug, description } = body;

  // --- Validation ---
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
    return NextResponse.json({ error: "Role slug is required" }, { status: 400 });
  }

  // Validate slug format
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

  // --- Clone role + capabilities in a transaction ---
  const clonedRole = await prisma.$transaction(async (tx) => {
    const newRole = await tx.role.create({
      data: {
        tenantId: session.tenantId,
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || sourceRole.description,
        isBuiltin: false,
        isActive: true,
        parentRoleId: sourceRole.id,
        createdById: session.id,
      },
    });

    // Copy all capability mappings from source role
    if (sourceRole.roleCapabilities.length > 0) {
      await tx.roleCapability.createMany({
        data: sourceRole.roleCapabilities.map((rc) => ({
          roleId: newRole.id,
          capabilityId: rc.capabilityId,
          granted: rc.granted,
        })),
      });
    }

    return newRole;
  });

  // Audit log (outside transaction)
  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "role.cloned",
    resourceType: "role",
    resourceId: clonedRole.id,
    result: "success",
    details: {
      name: clonedRole.name,
      slug: clonedRole.slug,
      clonedFrom: { id: sourceRole.id, name: sourceRole.name, slug: sourceRole.slug },
      capabilityCount: sourceRole.roleCapabilities.filter((rc) => rc.granted).length,
    },
    request,
  });

  // Invalidate RBAC cache
  rbac.invalidateCache(session.tenantId);

  const grantedCount = sourceRole.roleCapabilities.filter((rc) => rc.granted).length;

  return NextResponse.json(
    {
      id: clonedRole.id,
      name: clonedRole.name,
      slug: clonedRole.slug,
      description: clonedRole.description,
      isBuiltin: clonedRole.isBuiltin,
      isActive: clonedRole.isActive,
      parentRoleId: clonedRole.parentRoleId,
      capabilityCount: grantedCount,
      totalCapabilities: CAPABILITIES.length,
      clonedFrom: {
        id: sourceRole.id,
        name: sourceRole.name,
        slug: sourceRole.slug,
      },
      createdBy: session.name,
      createdAt: clonedRole.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
