import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revokeAllUserSessions } from "@/lib/security";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/auth/sessions/revoke-all
 *
 * Revoke all sessions for a user.
 * - If no userId is provided, revokes all sessions for the current user.
 * - If userId differs from current user, requires admin.user.manage.
 * - If excludeSessionId is provided, that session is kept active (useful
 *   for "revoke all other sessions" so the caller's current session survives).
 *
 * Body: { userId?: string; excludeSessionId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId: string = body.userId || session.id;

    // If revoking another user's sessions, check admin capability
    if (targetUserId !== session.id) {
      const hasCapability = await rbac.checkCapability(
        session.id,
        session.tenantId,
        "admin.user.manage"
      );
      if (!hasCapability) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Verify the target user belongs to the same tenant
      const targetUser = await prisma.user.findFirst({
        where: { id: targetUserId, tenantId: session.tenantId },
        select: { id: true },
      });
      if (!targetUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
    }

    // Revoke all sessions for the target user, optionally excluding one session
    const revokedCount = await revokeAllUserSessions(
      targetUserId,
      body.excludeSessionId,
      session.id
    );

    // Create audit log
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "session.revoked_all",
      resourceType: "user",
      resourceId: targetUserId,
      details: {
        revokedCount,
        selfRevoke: targetUserId === session.id,
      },
      result: "success",
      request,
    });

    return NextResponse.json({ success: true, revokedCount });
  } catch (error) {
    console.error("[API] auth/sessions/revoke-all error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
