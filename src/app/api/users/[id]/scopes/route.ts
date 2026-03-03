import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

/**
 * GET /api/users/[id]/scopes
 *
 * List all scopes assigned to a specific user.
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

  const userScopes = await prisma.userScope.findMany({
    where: { userId: id },
    include: {
      scope: true,
    },
  });

  return NextResponse.json({
    user: { id: targetUser.id, name: targetUser.name, email: targetUser.email },
    scopes: userScopes.map((us) => ({
      id: us.scope.id,
      name: us.scope.name,
      description: us.scope.description,
      tagFilter: safeParse(us.scope.tagFilter),
      isGlobal: us.scope.isGlobal,
      assignedAt: us.assignedAt.toISOString(),
    })),
  });
}

/**
 * POST /api/users/[id]/scopes
 *
 * Assign a scope to a user.
 * Requires: admin.user.manage capability.
 *
 * Body: { scopeId: string }
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
    session.id, session.tenantId, "admin.user.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;
  const { scopeId } = await request.json();

  if (!scopeId) {
    return NextResponse.json(
      { error: "scopeId is required" },
      { status: 400 }
    );
  }

  // Verify user belongs to same tenant
  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify scope belongs to same tenant
  const scope = await prisma.scope.findFirst({
    where: { id: scopeId, tenantId: session.tenantId },
  });

  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  try {
    const userScope = await prisma.userScope.create({
      data: {
        userId: id,
        scopeId,
      },
      include: { scope: true },
    });

    rbac.invalidateCache(session.tenantId, id);

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "scope.assigned",
      resourceType: "user",
      resourceId: id,
      result: "success",
      details: {
        scopeId,
        scopeName: scope.name,
        userName: targetUser.name,
      },
      request,
    });

    return NextResponse.json(
      {
        id: userScope.scope.id,
        name: userScope.scope.name,
        description: userScope.scope.description,
        tagFilter: safeParse(userScope.scope.tagFilter),
        isGlobal: userScope.scope.isGlobal,
        assignedAt: userScope.assignedAt.toISOString(),
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
        { error: "Scope already assigned to this user" },
        { status: 409 }
      );
    }
    throw error;
  }
}
