import { NextRequest, NextResponse } from "next/server";
import { verifyToken, completeLoginAfterMFA } from "@/lib/auth";
import { verifyTOTPCode, verifyBackupCode } from "@/lib/totp";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/auth/mfa/verify — Verify TOTP code during login.
 * Reads the MFA pending token from cookie, validates the TOTP code,
 * then completes the login by issuing full JWT tokens.
 */
export async function POST(request: NextRequest) {
  try {
    const mfaCookie = request.cookies.get("byoc_mfa")?.value;
    if (!mfaCookie) {
      return NextResponse.json(
        { error: "MFA session expired. Please login again." },
        { status: 401 }
      );
    }

    // Verify the MFA pending token
    const payload = verifyToken(mfaCookie);
    if (!payload || payload.type !== "mfa_pending") {
      return NextResponse.json(
        { error: "Invalid MFA session. Please login again." },
        { status: 401 }
      );
    }

    const { code, isBackupCode } = await request.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
    }

    // Fetch user with MFA secret
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, tenantId: true, mfaSecret: true, mfaBackupCodes: true, mfaEnabled: true },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: "MFA not configured" }, { status: 400 });
    }

    let verified = false;
    let method = "totp";

    if (isBackupCode) {
      // Verify backup code
      const hashedCodes: string[] = JSON.parse(user.mfaBackupCodes || "[]");
      const matchIndex = await verifyBackupCode(code, hashedCodes);
      if (matchIndex >= 0) {
        verified = true;
        method = "backup_code";
        // Remove used backup code
        hashedCodes.splice(matchIndex, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaBackupCodes: JSON.stringify(hashedCodes) },
        });
      }
    } else {
      // Verify TOTP code
      verified = verifyTOTPCode(user.mfaSecret, code);
    }

    if (!verified) {
      await createAuditLog({
        tenantId: user.tenantId,
        actorId: user.id,
        actorType: "user",
        action: "mfa.verify_failed",
        result: "denied",
        details: { method },
        request,
      });
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // MFA verified — complete the login
    const result = await completeLoginAfterMFA(payload.userId, request);
    if (!result) {
      return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }

    // Audit log
    await createAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: "user",
      action: method === "backup_code" ? "mfa.backup_used" : "mfa.verified",
      result: "success",
      details: { method },
      request,
    });

    const isProduction = process.env.NODE_ENV === "production";
    const response = NextResponse.json({
      user: result.user,
      message: "Login successful",
    });

    response.cookies.set("byoc_token", result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 15 * 60,
      path: "/",
    });

    response.cookies.set("byoc_refresh", result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    // Clear the MFA cookie
    response.cookies.delete("byoc_mfa");

    return response;
  } catch (error) {
    console.error("MFA verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
