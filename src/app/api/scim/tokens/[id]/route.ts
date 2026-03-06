import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

/**
 * DELETE /api/scim/tokens/[id] — Revoke SCIM token.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await rbac.checkCapability(session.id, session.tenantId, "admin.scim.manage");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const token = await prisma.sCIMToken.findFirst({
      where: { id, tenantId: session.tenantId },
    });

    if (!token) {
      return NextResponse.json({ error: "SCIM token not found" }, { status: 404 });
    }

    await prisma.sCIMToken.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "scim.token.revoked",
      result: "success",
      resourceType: "scim_token",
      resourceId: id,
      details: { name: token.name },
      request,
    });

    return NextResponse.json({ message: "SCIM token revoked" });
  } catch (error) {
    console.error("SCIM token revoke error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
