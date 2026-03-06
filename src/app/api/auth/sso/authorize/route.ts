import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { encrypt } from "@/lib/encryption";
import { buildAuthorizationUrl, generateState, generatePKCE } from "@/lib/oauth";

/**
 * GET /api/auth/sso/authorize?providerId=xxx — Start OAuth flow.
 * Generates state + PKCE, stores in cookie, redirects to provider.
 */
export async function GET(request: NextRequest) {
  try {
    const providerId = request.nextUrl.searchParams.get("providerId");
    if (!providerId) {
      return NextResponse.json({ error: "providerId is required" }, { status: 400 });
    }

    // Load provider configuration
    const provider = await prisma.sSOProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider || !provider.isEnabled) {
      return NextResponse.json({ error: "SSO provider not found or disabled" }, { status: 404 });
    }

    // Decrypt client credentials
    const clientId = decrypt(provider.clientId);
    const clientSecret = decrypt(provider.clientSecret);

    // Generate PKCE and state
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();

    // Build the callback URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get("host")}`;
    const redirectUri = `${appUrl}/api/auth/sso/callback`;

    // Build authorization URL
    const authUrl = buildAuthorizationUrl(
      {
        id: provider.id,
        providerType: provider.providerType,
        clientId,
        clientSecret,
        issuerUrl: provider.issuerUrl,
        authorizationUrl: provider.authorizationUrl,
        tokenUrl: provider.tokenUrl,
        userinfoUrl: provider.userinfoUrl,
        scopes: provider.scopes,
      },
      redirectUri,
      state,
      codeChallenge
    );

    // Store state and PKCE verifier in encrypted cookie
    const ssoData = JSON.stringify({
      state,
      codeVerifier,
      providerId: provider.id,
    });

    const isProduction = process.env.NODE_ENV === "production";
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("byoc_sso", encrypt(ssoData), {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 10 * 60, // 10 minutes
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("SSO authorize error:", error);
    return NextResponse.redirect(
      new URL("/login?error=sso_failed", request.url)
    );
  }
}
