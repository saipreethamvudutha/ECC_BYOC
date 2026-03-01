import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

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

  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, tenantId: session.tenantId, status: "pending" },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Pending invitation not found" }, { status: 404 });
  }

  // Transaction: revoke invitation + deactivate user
  await prisma.$transaction([
    prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "revoked" },
    }),
    prisma.user.updateMany({
      where: {
        tenantId: session.tenantId,
        email: invitation.email,
        status: "invited",
      },
      data: { status: "deactivated" },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: session.id,
        actorType: "user",
        action: "user.invitation_revoked",
        resourceType: "invitation",
        resourceId: invitationId,
        result: "success",
        details: JSON.stringify({ email: invitation.email }),
      },
    }),
  ]);

  return NextResponse.json({ message: "Invitation revoked successfully" });
}
