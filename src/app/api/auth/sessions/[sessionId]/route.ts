import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revokeSession } from "@/lib/security";
import { createAuditLog } from "@/lib/audit";

/**
 * DELETE /api/auth/sessions/[sessionId]
 *
 * Revoke a specific session.
 * - If the session belongs to the current user: no special capability needed.
 * - If the session belongs to a different user: requires admin.user.manage.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;

    // Find the target session
    const targetSession = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!targetSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Verify the target session belongs to the same tenant
    if (targetSession.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // If the target session belongs to a different user, check admin capability
    if (targetSession.userId !== session.id) {
      const hasCapability = await rbac.checkCapability(
        session.id,
        session.tenantId,
        "admin.user.manage"
      );
      if (!hasCapability) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Revoke the session
    await revokeSession(sessionId, session.id);

    // Create audit log
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "session.revoked",
      resourceType: "session",
      resourceId: sessionId,
      details: {
        targetUserId: targetSession.userId,
        selfRevoke: targetSession.userId === session.id,
      },
      result: "success",
      request,
    });

    return NextResponse.json({ success: true, message: "Session revoked" });
  } catch (error) {
    console.error("[API] auth/sessions/[sessionId] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
