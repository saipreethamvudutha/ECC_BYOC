import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyTOTPCode } from "@/lib/totp";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/auth/mfa/disable — Disable MFA.
 * Requires a valid TOTP code to prove possession of the authenticator.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
    }

    // Fetch user MFA secret
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    // Verify the code first
    const valid = verifyTOTPCode(user.mfaSecret, code);
    if (!valid) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    // Disable MFA
    await prisma.user.update({
      where: { id: session.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
      },
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "mfa.disabled",
      result: "success",
    });

    return NextResponse.json({ message: "MFA disabled successfully" });
  } catch (error) {
    console.error("MFA disable error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
