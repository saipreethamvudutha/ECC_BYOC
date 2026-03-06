import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { generateToken } from "@/lib/auth";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/oauth";
import { createAuditLog } from "@/lib/audit";
import { createSession } from "@/lib/security";

/**
 * GET /api/auth/sso/callback — OAuth callback handler.
 * Exchanges code for tokens, fetches user info, JIT provisions, issues JWT.
 */
export async function GET(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");

    if (error) {
      loginUrl.searchParams.set("error", `sso_${error}`);
      return NextResponse.redirect(loginUrl);
    }

    if (!code || !state) {
      loginUrl.searchParams.set("error", "sso_missing_params");
      return NextResponse.redirect(loginUrl);
    }

    // Retrieve and validate state from cookie
    const ssoCookie = request.cookies.get("byoc_sso")?.value;
    if (!ssoCookie) {
      loginUrl.searchParams.set("error", "sso_session_expired");
      return NextResponse.redirect(loginUrl);
    }

    const ssoData = JSON.parse(decrypt(ssoCookie));
    if (ssoData.state !== state) {
      loginUrl.searchParams.set("error", "sso_state_mismatch");
      return NextResponse.redirect(loginUrl);
    }

    // Load provider
    const provider = await prisma.sSOProvider.findUnique({
      where: { id: ssoData.providerId },
    });

    if (!provider || !provider.isEnabled) {
      loginUrl.searchParams.set("error", "sso_provider_disabled");
      return NextResponse.redirect(loginUrl);
    }

    const clientId = decrypt(provider.clientId);
    const clientSecret = decrypt(provider.clientSecret);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get("host")}`;
    const redirectUri = `${appUrl}/api/auth/sso/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
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
      code,
      redirectUri,
      ssoData.codeVerifier
    );

    // Fetch user info
    const userInfo = await fetchUserInfo(
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
      tokens.access_token
    );

    if (!userInfo.email) {
      loginUrl.searchParams.set("error", "sso_no_email");
      return NextResponse.redirect(loginUrl);
    }

    // Validate email domain
    const domains: string[] = JSON.parse(provider.domains || "[]");
    if (domains.length > 0) {
      const emailDomain = userInfo.email.split("@")[1]?.toLowerCase();
      if (!domains.some(d => d.toLowerCase() === emailDomain)) {
        loginUrl.searchParams.set("error", "sso_domain_not_allowed");
        return NextResponse.redirect(loginUrl);
      }
    }

    // Find or create user (JIT provisioning)
    let user = await prisma.user.findFirst({
      where: {
        tenantId: provider.tenantId,
        OR: [
          { authProviderId: userInfo.sub, authProvider: provider.providerType },
          { email: userInfo.email },
        ],
      },
      include: {
        tenant: true,
        userRoles: { include: { role: true } },
      },
    });

    if (!user && provider.autoProvision) {
      // JIT provision: create new user
      user = await prisma.user.create({
        data: {
          tenantId: provider.tenantId,
          email: userInfo.email,
          name: userInfo.name || userInfo.email.split("@")[0],
          authProvider: provider.providerType,
          authProviderId: userInfo.sub,
          avatarUrl: userInfo.picture,
          status: "active",
          // Assign default role if configured
          ...(provider.defaultRoleId
            ? {
                userRoles: {
                  create: { roleId: provider.defaultRoleId },
                },
              }
            : {}),
        },
        include: {
          tenant: true,
          userRoles: { include: { role: true } },
        },
      });

      await createAuditLog({
        tenantId: provider.tenantId,
        actorId: user.id,
        actorType: "system",
        action: "sso.user_provisioned",
        result: "success",
        details: {
          provider: provider.providerType,
          email: userInfo.email,
          jitProvision: true,
        },
        request,
      });
    } else if (user) {
      // Link/update SSO identity
      await prisma.user.update({
        where: { id: user.id },
        data: {
          authProvider: provider.providerType,
          authProviderId: userInfo.sub,
          avatarUrl: userInfo.picture || user.avatarUrl,
          lastLoginAt: new Date(),
        },
      });
    } else {
      loginUrl.searchParams.set("error", "sso_no_account");
      return NextResponse.redirect(loginUrl);
    }

    if (user.status !== "active") {
      loginUrl.searchParams.set("error", "sso_account_suspended");
      return NextResponse.redirect(loginUrl);
    }

    // Check if user has MFA enabled — if so, redirect to MFA step
    if (user.mfaEnabled && user.mfaSecret) {
      const mfaPendingToken = generateToken(
        { userId: user.id, tenantId: user.tenantId, email: user.email, type: "mfa_pending" },
        5 * 60
      );

      await createAuditLog({
        tenantId: user.tenantId,
        actorId: user.id,
        actorType: "user",
        action: "sso.login_mfa_pending",
        result: "success",
        details: { provider: provider.providerType },
        request,
      });

      const isProduction = process.env.NODE_ENV === "production";
      const mfaRedirect = new URL("/login?mfa=true", request.url);
      const response = NextResponse.redirect(mfaRedirect);
      response.cookies.set("byoc_mfa", mfaPendingToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 5 * 60,
        path: "/",
      });
      response.cookies.delete("byoc_sso");
      return response;
    }

    // Issue JWT tokens and create session
    const accessToken = generateToken(
      { userId: user.id, tenantId: user.tenantId, email: user.email, type: "access" },
      15 * 60
    );
    const refreshToken = generateToken(
      { userId: user.id, tenantId: user.tenantId, email: user.email, type: "refresh" },
      7 * 24 * 60 * 60
    );

    await createSession(user.id, user.tenantId, refreshToken, request);

    await createAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "sso.login",
      result: "success",
      details: { provider: provider.providerType },
      request,
    });

    const isProduction = process.env.NODE_ENV === "production";
    const dashboardUrl = new URL("/", request.url);
    const response = NextResponse.redirect(dashboardUrl);

    response.cookies.set("byoc_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 15 * 60,
      path: "/",
    });

    response.cookies.set("byoc_refresh", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    response.cookies.delete("byoc_sso");

    return response;
  } catch (error) {
    console.error("SSO callback error:", error);
    loginUrl.searchParams.set("error", "sso_failed");
    return NextResponse.redirect(loginUrl);
  }
}
