import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { cleanupExpiredSessions } from "@/lib/security";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/auth/sessions/cleanup
 *
 * Admin-only endpoint to clean up expired sessions from the database.
 * Requires: admin.user.manage capability.
 *
 * Returns: { success: true, cleaned: <number> }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await rbac.checkCapability(
      session.id,
      session.tenantId,
      "admin.user.manage"
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden: missing admin.user.manage capability" },
        { status: 403 }
      );
    }

    const cleaned = await cleanupExpiredSessions();

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "admin.sessions_cleanup",
      result: "success",
      details: { expiredSessionsCleaned: cleaned },
      request,
    });

    return NextResponse.json({ success: true, cleaned });
  } catch (error) {
    console.error("[API] auth/sessions/cleanup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
