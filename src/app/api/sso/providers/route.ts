import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { createAuditLog } from "@/lib/audit";

/**
 * GET /api/sso/providers — List SSO providers (admin).
 * POST /api/sso/providers — Create SSO provider.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await rbac.checkCapability(session.id, session.tenantId, "admin.sso.view");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const providers = await prisma.sSOProvider.findMany({
      where: { tenantId: session.tenantId },
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    // Mask secrets — only show last 4 chars of clientId
    const masked = providers.map(p => ({
      ...p,
      clientId: `****${decrypt(p.clientId).slice(-4)}`,
      clientSecret: "••••••••",
    }));

    return NextResponse.json({ providers: masked });
  } catch (error) {
    console.error("SSO providers list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await rbac.checkCapability(session.id, session.tenantId, "admin.sso.manage");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { providerType, name, clientId, clientSecret, issuerUrl, domains, defaultRoleId, scopes } = body;

    if (!providerType || !name || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "providerType, name, clientId, and clientSecret are required" },
        { status: 400 }
      );
    }

    if (!["google", "azure_ad", "okta"].includes(providerType)) {
      return NextResponse.json(
        { error: "providerType must be google, azure_ad, or okta" },
        { status: 400 }
      );
    }

    // Check if provider type already exists for this tenant
    const existing = await prisma.sSOProvider.findUnique({
      where: { tenantId_providerType: { tenantId: session.tenantId, providerType } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `An SSO provider of type '${providerType}' already exists` },
        { status: 409 }
      );
    }

    const provider = await prisma.sSOProvider.create({
      data: {
        tenantId: session.tenantId,
        providerType,
        name,
        clientId: encrypt(clientId),
        clientSecret: encrypt(clientSecret),
        issuerUrl: issuerUrl || null,
        domains: JSON.stringify(domains || []),
        defaultRoleId: defaultRoleId || null,
        scopes: scopes || "openid profile email",
        isEnabled: false, // Must be explicitly enabled
        createdById: session.id,
      },
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "sso.provider.created",
      result: "success",
      resourceType: "sso_provider",
      resourceId: provider.id,
      details: { providerType, name },
      request,
    });

    return NextResponse.json({
      provider: {
        ...provider,
        clientId: `****${clientId.slice(-4)}`,
        clientSecret: "••••••••",
      },
    }, { status: 201 });
  } catch (error) {
    console.error("SSO provider create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
