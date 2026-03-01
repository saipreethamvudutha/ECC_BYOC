import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      totalCapabilities: 39,
      userCount: r._count.userRoles,
      createdBy: r.createdBy?.name || "System",
      createdAt: r.createdAt.toISOString(),
    }))
  );
}
