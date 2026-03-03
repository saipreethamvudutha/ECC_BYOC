import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/sessions
 *
 * Current user's own active sessions. No special capability required.
 * Returns all active sessions for the authenticated user, sorted by lastActiveAt desc.
 *
 * Returns: { sessions: [{ id, ipAddress, device, userAgent, lastActiveAt, createdAt, city, country }] }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await prisma.session.findMany({
      where: {
        userId: session.id,
        isActive: true,
      },
      orderBy: { lastActiveAt: "desc" },
    });

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
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
    console.error("[API] auth/sessions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
