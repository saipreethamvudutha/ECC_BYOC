import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { CAPABILITIES } from "@/lib/capabilities";

/**
 * GET /api/roles/[roleId]/permissions
 *
 * Returns a role's capabilities grouped by module (v2).
 * Used by the onboarding wizard and role editor.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
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
      roleCapabilities: {
        include: {
          capability: true,
        },
      },
      userRoles: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  // Group capabilities by module
  const capabilitiesByModule: Record<
    string,
    { id: string; name: string; description: string; riskLevel: string; granted: boolean }[]
  > = {};

  let grantedCount = 0;

  for (const rc of role.roleCapabilities) {
    const mod = rc.capability.module;
    if (!capabilitiesByModule[mod]) capabilitiesByModule[mod] = [];
    capabilitiesByModule[mod].push({
      id: rc.capabilityId,
      name: rc.capability.name,
      description: rc.capability.description || "",
      riskLevel: rc.capability.riskLevel,
      granted: rc.granted,
    });
    if (rc.granted) grantedCount++;
  }

  return NextResponse.json({
    role: {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      isBuiltin: role.isBuiltin,
      maxAssignments: role.maxAssignments,
    },
    capabilitiesByModule,
    totalCapabilities: grantedCount,
    totalAvailable: CAPABILITIES.length,
    users: role.userRoles.map((ur: any) => ({
      id: ur.user.id,
      name: ur.user.name,
      email: ur.user.email,
      assignedAt: ur.assignedAt.toISOString(),
    })),
  });
}
