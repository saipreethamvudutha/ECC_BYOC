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

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "admin.user.manage"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { invitationId } = await request.json();
  if (!invitationId) {
    return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 });
  }

  // Find existing invitation
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, tenantId: session.tenantId, status: "pending" },
    include: {
      role: true,
      invitedBy: { select: { name: true } },
      tenant: true,
    },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Pending invitation not found" }, { status: 404 });
  }

  // Find the invited user name
  const invitedUser = await prisma.user.findFirst({
    where: { tenantId: session.tenantId, email: invitation.email, status: "invited" },
  });

  // Generate new token, invalidating old one
  const newToken = uuid();
  const newTokenHash = await bcrypt.hash(newToken, 10);
  const newTokenPrefix = newToken.substring(0, 8);
  const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      tokenHash: newTokenHash,
      tokenPrefix: newTokenPrefix,
      expiresAt: newExpiry,
    },
  });

  // Build and send invitation email
  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/accept-invitation?token=${newToken}`;

  let emailWarning: string | undefined;
  try {
    const emailResult = await sendInvitationEmail({
      to: invitation.email,
      inviteeName: invitedUser?.name || "there",
      inviterName: session.name,
      orgName: invitation.tenant.name,
      roleName: invitation.role.name,
      inviteLink,
      expiresAt: newExpiry,
    });

    if (!emailResult.success) {
      emailWarning = "Token refreshed but email delivery failed.";
    }
  } catch {
    emailWarning = "Token refreshed but email service unavailable.";
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "user.invitation_resent",
      resourceType: "invitation",
      resourceId: invitationId,
      result: "success",
    },
  });

  return NextResponse.json({
    message: emailWarning || "Invitation resent successfully",
    inviteLink,
    warning: emailWarning,
  });
}
