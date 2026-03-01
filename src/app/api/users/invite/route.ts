import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { sendInvitationEmail, getAppUrl } from "@/lib/email";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check permission
  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "admin.user.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { email, name, roleId, expiresAt } = await request.json();

  if (!email || !name || !roleId) {
    return NextResponse.json(
      { error: "Email, name, and role are required" },
      { status: 400 }
    );
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: session.tenantId, email } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  // Verify role exists and belongs to tenant
  const role = await prisma.role.findFirst({
    where: { id: roleId, tenantId: session.tenantId },
  });
  if (!role) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Create user with "invited" status and temporary password
  const tempPassword = uuid().slice(0, 12);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      tenantId: session.tenantId,
      email,
      name,
      passwordHash,
      status: "invited",
    },
  });

  // Assign role
  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId,
      assignedBy: session.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  // Create invitation record with token
  const token = uuid();
  const tokenHash = await bcrypt.hash(token, 10);
  const tokenPrefix = token.substring(0, 8);
  const invitationExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  await prisma.invitation.create({
    data: {
      tenantId: session.tenantId,
      email,
      roleId,
      invitedById: session.id,
      tokenHash,
      tokenPrefix,
      expiresAt: invitationExpiry,
    },
  });

  // Build invitation link
  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/accept-invitation?token=${token}`;

  // Send invitation email
  let emailWarning: string | undefined;
  try {
    const emailResult = await sendInvitationEmail({
      to: email,
      inviteeName: name,
      inviterName: session.name,
      orgName: session.tenantName,
      roleName: role.name,
      inviteLink,
      expiresAt: invitationExpiry,
    });

    if (!emailResult.success) {
      emailWarning = "Invitation created but email delivery failed. Share the link manually.";
    }
  } catch {
    emailWarning = "Invitation created but email service unavailable. Share the link manually.";
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "user.invited",
      resourceType: "user",
      resourceId: user.id,
      result: "success",
      details: JSON.stringify({
        email,
        role: role.name,
        emailSent: !emailWarning,
      }),
    },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      role: role.name,
    },
    inviteLink,
    message: emailWarning
      ? "User invited. Email delivery failed — share the link below."
      : "User invited successfully. Invitation email sent.",
    warning: emailWarning,
  });
}
