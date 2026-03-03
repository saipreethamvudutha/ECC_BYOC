import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import crypto from "crypto";
import * as bcrypt from "bcryptjs";

/**
 * GET /api/api-keys
 *
 * List all API keys for the current tenant.
 * Capability: admin.apikey.manage
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasCapability = await rbac.checkCapability(
    session.id,
    session.tenantId,
    "admin.apikey.manage"
  );
  if (!hasCapability) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKeys = await prisma.apiKey.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      role: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(
    apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      role: k.role.name,
      createdBy: k.createdBy.name,
      rateLimit: k.rateLimit,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      expiresAt: k.expiresAt.toISOString(),
      createdAt: k.createdAt.toISOString(),
    }))
  );
}

/**
 * POST /api/api-keys
 *
 * Create a new API key.
 * Capability: admin.apikey.manage
 *
 * Body: { name: string, roleId: string, expiresInDays?: number, ipAllowlist?: string[], rateLimit?: number }
 *
 * Returns the full key ONCE in the response (never stored in plaintext).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCapability = await rbac.checkCapability(
      session.id,
      session.tenantId,
      "admin.apikey.manage"
    );
    if (!hasCapability) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, roleId, expiresInDays, ipAllowlist, rateLimit } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!roleId || typeof roleId !== "string") {
      return NextResponse.json(
        { error: "roleId is required" },
        { status: 400 }
      );
    }

    // Verify the role belongs to the same tenant
    const role = await prisma.role.findFirst({
      where: { id: roleId, tenantId: session.tenantId, isActive: true },
      select: { id: true, name: true },
    });

    if (!role) {
      return NextResponse.json(
        { error: "Role not found or does not belong to this tenant" },
        { status: 404 }
      );
    }

    // Check unique name constraint (tenantId + name)
    const existing = await prisma.apiKey.findFirst({
      where: { tenantId: session.tenantId, name: name.trim() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An API key with this name already exists" },
        { status: 409 }
      );
    }

    // Generate the raw API key
    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 8);

    // Calculate expiration
    const days = expiresInDays && Number(expiresInDays) > 0
      ? Number(expiresInDays)
      : 90;
    const expiresAt = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000
    );

    // Create the API key record
    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId: session.tenantId,
        name: name.trim(),
        keyHash,
        keyPrefix,
        roleId,
        createdById: session.id,
        ipAllowlist: ipAllowlist ? JSON.stringify(ipAllowlist) : null,
        rateLimit: rateLimit && Number(rateLimit) > 0 ? Number(rateLimit) : 1000,
        expiresAt,
      },
      include: {
        role: { select: { name: true } },
      },
    });

    // Audit log
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "apikey.created",
      resourceType: "ApiKey",
      resourceId: apiKey.id,
      details: {
        name: apiKey.name,
        keyPrefix,
        roleName: role.name,
        expiresInDays: days,
      },
      result: "success",
      request,
    });

    // Return the full key (shown only once)
    return NextResponse.json(
      {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix,
        role: apiKey.role.name,
        expiresAt: apiKey.expiresAt.toISOString(),
        createdAt: apiKey.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] api-keys POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
