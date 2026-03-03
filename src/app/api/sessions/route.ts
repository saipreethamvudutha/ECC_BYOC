import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/sessions
 *
 * Admin: list all active sessions for the current tenant.
 * Capability: admin.user.view
 *
 * Returns: { sessions: [{ id, userId, userName, userEmail, ipAddress, device, userAgent, lastActiveAt, createdAt, city, country }] }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCapability = await rbac.checkCapability(
      session.id,
      session.tenantId,
      "admin.user.view"
    );
    if (!hasCapability) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sessions = await prisma.session.findMany({
      where: {
        tenantId: session.tenantId,
        isActive: true,
      },
      orderBy: { lastActiveAt: "desc" },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            status: true,
            avatarUrl: true,
          },
        },
      },
    });

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        userName: s.user.name,
        userEmail: s.user.email,
        userStatus: s.user.status,
        userAvatarUrl: s.user.avatarUrl,
        ipAddress: s.ipAddress,
        device: s.device,
        userAgent: s.userAgent,
        lastActiveAt: s.lastActiveAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        city: s.city,
        country: s.country,
      })),
    });
  } catch (error) {
    console.error("[API] sessions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
