import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { isValidUUID } from "@/lib/validation";
import { clearRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/users/[id]/reset-lockout
 *
 * Reset a user's account lockout state. Clears failed login attempts,
 * the lockout timer, and any in-memory rate-limit entries for the user.
 *
 * Requires: admin.user.manage capability.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Authorize — require admin.user.manage capability
    const allowed = await rbac.checkCapability(
      session.id,
      session.tenantId,
      "admin.user.manage"
    );
    if (!allowed) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id } = await params;

    // 3. Validate UUID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    // 4. Verify the target user belongs to the same tenant
    const targetUser = await prisma.user.findFirst({
      where: { id, tenantId: session.tenantId },
      select: { id: true, tenantId: true, email: true, name: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 5. Reset lockout fields
    await prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // 6. Clear in-memory rate limits keyed by the target user's email
    //    (login rate-limit keys are prefixed with the user's email)
    clearRateLimit(targetUser.email);

    // 7. Audit log
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "user.lockout_reset",
      resourceType: "user",
      resourceId: id,
      result: "success",
      details: {
        targetUserId: id,
        targetUserEmail: targetUser.email,
        targetUserName: targetUser.name,
      },
      request,
    });

    // 8. Return success
    return NextResponse.json({
      success: true,
      message: `Account lockout reset for ${targetUser.email}`,
      userId: id,
    });
  } catch (error) {
    console.error("[admin/reset-lockout] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset account lockout" },
      { status: 500 }
    );
  }
}
