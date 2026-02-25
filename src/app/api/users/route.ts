import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      userRoles: {
        include: {
          role: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      authProvider: u.authProvider,
      mfaEnabled: u.mfaEnabled,
      lastLoginAt: u.lastLoginAt?.toISOString() || null,
      avatarUrl: u.avatarUrl,
      roles: u.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        slug: ur.role.slug,
      })),
      createdAt: u.createdAt.toISOString(),
    }))
  );
}
