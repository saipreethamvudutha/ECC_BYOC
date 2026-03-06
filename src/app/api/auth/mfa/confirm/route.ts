import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyTOTPCode, generateBackupCodes } from "@/lib/totp";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/auth/mfa/confirm — Confirm MFA setup with first TOTP code.
 * Validates the code, saves the secret, generates backup codes.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "Invalid code. Must be 6 digits." }, { status: 400 });
    }

    // Get the pending secret from cookie
    const setupCookie = request.cookies.get("byoc_mfa_setup")?.value;
    if (!setupCookie) {
      return NextResponse.json(
        { error: "MFA setup session expired. Please start again." },
        { status: 400 }
      );
    }

    // Decrypt: cookie contains encrypt(encryptedSecret), so we decrypt twice
    const encryptedSecret = decrypt(setupCookie);

    // Verify the TOTP code against the pending secret
    const valid = verifyTOTPCode(encryptedSecret, code);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid verification code. Please try again." },
        { status: 400 }
      );
    }

    // Generate backup codes
    const { plainCodes, hashedCodes } = await generateBackupCodes();

    // Save to database
    await prisma.user.update({
      where: { id: session.id },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaBackupCodes: JSON.stringify(hashedCodes),
      },
    });

    // Audit log
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "mfa.enabled",
      result: "success",
      details: { backupCodesGenerated: hashedCodes.length },
    });

    // Clear the setup cookie
    const response = NextResponse.json({
      message: "MFA enabled successfully",
      backupCodes: plainCodes,
    });
    response.cookies.delete("byoc_mfa_setup");

    return response;
  } catch (error) {
    console.error("MFA confirm error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
