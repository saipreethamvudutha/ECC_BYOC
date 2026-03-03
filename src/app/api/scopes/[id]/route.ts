import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { isValidUUID } from "@/lib/validation";

const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

/**
 * GET /api/scopes/[id]
 *
 * Get a single scope with its assigned users.
 * Requires: admin.role.view capability.
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
    session.id, session.tenantId, "admin.role.view"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const scope = await prisma.scope.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      createdBy: { select: { name: true } },
      userScopes: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: scope.id,
    name: scope.name,
    description: scope.description,
    tagFilter: safeParse(scope.tagFilter),
    isGlobal: scope.isGlobal,
    createdBy: scope.createdBy?.name ?? null,
    createdAt: scope.createdAt.toISOString(),
    updatedAt: scope.updatedAt.toISOString(),
    users: scope.userScopes.map((us) => ({
      id: us.user.id,
      name: us.user.name,
      email: us.user.email,
      assignedAt: us.assignedAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/scopes/[id]
 *
 * Update a scope.
 * Requires: admin.role.manage capability.
 *
 * Body: { name?, description?, tagFilter?, isGlobal? }
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
    session.id, session.tenantId, "admin.role.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const scope = await prisma.scope.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const { name, description, tagFilter, isGlobal } = await request.json();

  // Cannot modify the isGlobal flag on a Global scope
  if (scope.isGlobal && isGlobal === false) {
    return NextResponse.json(
      { error: "Cannot remove global flag from a Global scope" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description;
  if (tagFilter !== undefined) updateData.tagFilter = JSON.stringify(tagFilter);
  if (isGlobal !== undefined) updateData.isGlobal = isGlobal;

  try {
    const updated = await prisma.scope.update({
      where: { id },
      data: updateData,
    });

    rbac.invalidateCache(session.tenantId);

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "scope.updated",
      resourceType: "scope",
      resourceId: id,
      result: "success",
      details: {
        name: updated.name,
        changes: Object.keys(updateData),
      },
      request,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      tagFilter: safeParse(updated.tagFilter),
      isGlobal: updated.isGlobal,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Scope name already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}

/**
 * DELETE /api/scopes/[id]
 *
 * Delete a scope.
 * Requires: admin.role.manage capability.
 * Cannot delete a global scope.
 */
export async function DELETE(
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

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const scope = await prisma.scope.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  if (scope.isGlobal) {
    return NextResponse.json(
      { error: "Cannot delete a global scope" },
      { status: 400 }
    );
  }

  await prisma.scope.delete({ where: { id } });

  rbac.invalidateCache(session.tenantId);

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "scope.deleted",
    resourceType: "scope",
    resourceId: id,
    result: "success",
    details: { name: scope.name },
    request,
  });

  return NextResponse.json({ success: true });
}
