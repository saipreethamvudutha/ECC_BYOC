import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [users, invitations] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        userRoles: {
          include: {
            role: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.invitation.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Build invitation map: email -> latest invitation
  const invitationMap = new Map<string, (typeof invitations)[0]>();
  for (const inv of invitations) {
    if (!invitationMap.has(inv.email)) {
      invitationMap.set(inv.email, inv);
    }
  }

  return NextResponse.json(
    users.map((u) => {
      const inv = invitationMap.get(u.email);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        authProvider: u.authProvider,
        mfaEnabled: u.mfaEnabled,
        lastLoginAt: u.lastLoginAt?.toISOString() || null,
        avatarUrl: u.avatarUrl,
        department: u.department,
        phone: u.phone,
        roles: u.userRoles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          slug: ur.role.slug,
        })),
        invitation: inv
          ? {
              id: inv.id,
              status: inv.status,
              expiresAt: inv.expiresAt.toISOString(),
              createdAt: inv.createdAt.toISOString(),
            }
          : null,
        createdAt: u.createdAt.toISOString(),
      };
    })
  );
}
