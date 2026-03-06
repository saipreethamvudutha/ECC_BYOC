import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateTOTPSecret } from "@/lib/totp";
import { encrypt } from "@/lib/encryption";

/**
 * POST /api/auth/mfa/setup — Initiate MFA enrollment.
 * Returns QR code and manual entry key.
 * The encrypted secret is stored in a temporary cookie until confirmed.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { secret, encryptedSecret, qrCodeDataUrl } = await generateTOTPSecret(session.email);

    const response = NextResponse.json({
      qrCodeDataUrl,
      manualEntryKey: secret,
    });

    // Store encrypted secret in temporary cookie (10 min TTL)
    // This is NOT saved to DB yet — must be confirmed with a valid code first
    const isProduction = process.env.NODE_ENV === "production";
    response.cookies.set("byoc_mfa_setup", encrypt(encryptedSecret), {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("MFA setup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
