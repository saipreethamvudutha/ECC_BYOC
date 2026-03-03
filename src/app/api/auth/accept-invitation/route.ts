import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import * as bcrypt from "bcryptjs";

// Helper: find invitation by raw token
async function findInvitationByToken(token: string) {
  const prefix = token.substring(0, 8);

  const invitations = await prisma.invitation.findMany({
    where: {
      tokenPrefix: prefix,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    include: {
      tenant: { select: { name: true, slug: true, plan: true } },
      role: { select: { id: true, name: true, slug: true, description: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });

  for (const invitation of invitations) {
    const match = await bcrypt.compare(token, invitation.tokenHash);
    if (match) return invitation;
  }

  return null;
}

// GET: Validate token and return invitation details
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }

  // M11: Explicit expiry validation (defense-in-depth)
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      orgName: invitation.tenant.name,
      orgPlan: invitation.tenant.plan,
      roleId: invitation.role.id,
      roleName: invitation.role.name,
      roleSlug: invitation.role.slug,
      roleDescription: invitation.role.description,
      invitedBy: invitation.invitedBy.name,
      expiresAt: invitation.expiresAt.toISOString(),
    },
  });
}

// POST: Accept invitation, set password, activate account, auto-login
export async function POST(request: NextRequest) {
  try {
    const { token, password, department, phone } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 }
      );
    }

    // Password strength validation
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "Password must contain uppercase, lowercase, and a number" },
        { status: 400 }
      );
    }

    // Find and validate invitation
    const invitation = await findInvitationByToken(token);
    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 404 }
      );
    }

    // M11: Explicit expiry validation (defense-in-depth)
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 }
      );
    }

    // Find the invited user
    const user = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: invitation.tenantId,
          email: invitation.email,
        },
      },
    });

    if (!user || user.status !== "invited") {
      return NextResponse.json(
        { error: "User account not found or already activated" },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Transaction: activate user + accept invitation
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: "active",
          department: department || null,
          phone: phone || null,
          lastLoginAt: new Date(),
        },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "accepted" },
      }),
    ]);

    // Audit log (outside transaction to preserve hash chain integrity)
    await createAuditLog({
      tenantId: invitation.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "user.invitation_accepted",
      resourceType: "invitation",
      resourceId: invitation.id,
      result: "success",
      details: {
        email: invitation.email,
        role: invitation.role.name,
      },
      request,
    });

    // Fetch full user for session
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        tenant: true,
        userRoles: { include: { role: true } },
      },
    });

    if (!fullUser) {
      return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
    }

    // Generate tokens for auto-login
    const accessToken = generateToken(
      { userId: user.id, tenantId: invitation.tenantId, email: user.email, type: "access" },
      15 * 60
    );
    const refreshToken = generateToken(
      { userId: user.id, tenantId: invitation.tenantId, email: user.email, type: "refresh" },
      7 * 24 * 60 * 60
    );

    const isProduction = process.env.NODE_ENV === "production";

    const response = NextResponse.json({
      user: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        tenantId: fullUser.tenantId,
        tenantName: fullUser.tenant.name,
        tenantPlan: fullUser.tenant.plan,
        roles: fullUser.userRoles.map((ur) => ur.role.slug),
        avatarUrl: fullUser.avatarUrl,
      },
      message: "Account activated successfully",
    });

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

    return response;
  } catch (error) {
    console.error("Accept invitation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
