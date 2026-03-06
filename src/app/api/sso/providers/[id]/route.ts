import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { createAuditLog } from "@/lib/audit";

/**
 * PATCH /api/sso/providers/[id] — Update SSO provider.
 * DELETE /api/sso/providers/[id] — Delete SSO provider.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await rbac.checkCapability(session.id, session.tenantId, "admin.sso.manage");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const provider = await prisma.sSOProvider.findFirst({
      where: { id, tenantId: session.tenantId },
    });

    if (!provider) {
      return NextResponse.json({ error: "SSO provider not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.clientId !== undefined) updateData.clientId = encrypt(body.clientId);
    if (body.clientSecret !== undefined) updateData.clientSecret = encrypt(body.clientSecret);
    if (body.issuerUrl !== undefined) updateData.issuerUrl = body.issuerUrl;
    if (body.domains !== undefined) updateData.domains = JSON.stringify(body.domains);
    if (body.defaultRoleId !== undefined) updateData.defaultRoleId = body.defaultRoleId;
    if (body.scopes !== undefined) updateData.scopes = body.scopes;
    if (body.isEnabled !== undefined) updateData.isEnabled = body.isEnabled;
    if (body.autoProvision !== undefined) updateData.autoProvision = body.autoProvision;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.sSOProvider.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "sso.provider.updated",
      result: "success",
      resourceType: "sso_provider",
      resourceId: id,
      details: { fields: Object.keys(updateData) },
      request,
    });

    return NextResponse.json({
      provider: { ...updated, clientId: "****", clientSecret: "••••••••" },
    });
  } catch (error) {
    console.error("SSO provider update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await rbac.checkCapability(session.id, session.tenantId, "admin.sso.manage");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const provider = await prisma.sSOProvider.findFirst({
      where: { id, tenantId: session.tenantId },
    });

    if (!provider) {
      return NextResponse.json({ error: "SSO provider not found" }, { status: 404 });
    }

    await prisma.sSOProvider.delete({ where: { id } });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "sso.provider.deleted",
      result: "success",
      resourceType: "sso_provider",
      resourceId: id,
      details: { providerType: provider.providerType, name: provider.name },
      request,
    });

    return NextResponse.json({ message: "SSO provider deleted" });
  } catch (error) {
    console.error("SSO provider delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
