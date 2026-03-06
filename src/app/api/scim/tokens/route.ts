import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

/**
 * GET /api/scim/tokens — List SCIM tokens.
 * POST /api/scim/tokens — Create SCIM token.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await rbac.checkCapability(session.id, session.tenantId, "admin.scim.view");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const tokens = await prisma.sCIMToken.findMany({
      where: { tenantId: session.tenantId },
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      tokens: tokens.map(t => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        createdBy: t.createdBy,
        expiresAt: t.expiresAt,
        lastUsedAt: t.lastUsedAt,
        isActive: t.isActive,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error("SCIM tokens list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await rbac.checkCapability(session.id, session.tenantId, "admin.scim.manage");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, expiresInDays } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Generate a random SCIM token
    const rawToken = `scim_${randomBytes(32).toString("hex")}`;
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const tokenPrefix = rawToken.slice(0, 12);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const token = await prisma.sCIMToken.create({
      data: {
        tenantId: session.tenantId,
        name,
        tokenHash,
        tokenPrefix,
        createdById: session.id,
        expiresAt,
      },
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "scim.token.created",
      result: "success",
      resourceType: "scim_token",
      resourceId: token.id,
      details: { name, expiresAt },
      request,
    });

    // Return the raw token ONCE (never stored, cannot be retrieved again)
    return NextResponse.json({
      token: rawToken,
      id: token.id,
      name: token.name,
      tokenPrefix,
      expiresAt,
      message: "Save this token now. It cannot be retrieved again.",
    }, { status: 201 });
  } catch (error) {
    console.error("SCIM token create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
