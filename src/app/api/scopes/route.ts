import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

/**
 * GET /api/scopes
 *
 * List all scopes for the current tenant.
 * Requires: admin.role.view capability.
 */
export async function GET() {
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

  const scopes = await prisma.scope.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { userScopes: true } },
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json(
    scopes.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tagFilter: JSON.parse(s.tagFilter),
      isGlobal: s.isGlobal,
      userCount: s._count.userScopes,
      createdBy: s.createdBy?.name ?? null,
      createdAt: s.createdAt.toISOString(),
    }))
  );
}

/**
 * POST /api/scopes
 *
 * Create a new scope.
 * Requires: admin.role.manage capability.
 *
 * Body: { name: string, description?: string, tagFilter: Record<string, string[]>, isGlobal?: boolean }
 */
export async function POST(request: NextRequest) {
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

  const { name, description, tagFilter, isGlobal } = await request.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  if (!tagFilter || typeof tagFilter !== "object" || Array.isArray(tagFilter)) {
    return NextResponse.json(
      { error: "tagFilter must be an object" },
      { status: 400 }
    );
  }

  try {
    const scope = await prisma.scope.create({
      data: {
        tenantId: session.tenantId,
        name: name.trim(),
        description: description || null,
        tagFilter: JSON.stringify(tagFilter),
        isGlobal: isGlobal ?? false,
        createdById: session.id,
      },
    });

    rbac.invalidateCache(session.tenantId);

    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: session.id,
        actorType: "user",
        action: "scope.created",
        resourceType: "scope",
        resourceId: scope.id,
        result: "success",
        details: JSON.stringify({ name: scope.name, isGlobal: scope.isGlobal }),
      },
    });

    return NextResponse.json(
      {
        id: scope.id,
        name: scope.name,
        description: scope.description,
        tagFilter: JSON.parse(scope.tagFilter),
        isGlobal: scope.isGlobal,
        createdAt: scope.createdAt.toISOString(),
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
        { error: "Scope name already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}
