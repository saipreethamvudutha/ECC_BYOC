import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  const { roleId } = await params;

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      roleCapabilities: {
        include: {
          capability: true,
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
  });
}
