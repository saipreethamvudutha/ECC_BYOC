import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import crypto from "crypto";
import * as bcrypt from "bcryptjs";

/**
 * DELETE /api/api-keys/[id]
 *
 * Revoke (deactivate) an API key.
 * Capability: admin.apikey.manage
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Find the API key and verify tenant ownership
    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey || apiKey.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    // Deactivate the key
    await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    // Audit log
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "apikey.revoked",
      resourceType: "ApiKey",
      resourceId: id,
      details: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
      result: "success",
      request,
    });

    return NextResponse.json({
      success: true,
      message: "API key revoked",
    });
  } catch (error) {
    console.error("[API] api-keys/[id] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/api-keys/[id]
 *
 * Rotate an API key: generate a new key, deactivate the old one (in-place update).
 * Capability: admin.apikey.manage
 *
 * Returns the new full key (shown only once).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Find the API key and verify tenant ownership
    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey || apiKey.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    if (!apiKey.isActive) {
      return NextResponse.json(
        { error: "Cannot rotate an inactive API key" },
        { status: 400 }
      );
    }

    // Generate new key
    const newRawKey = crypto.randomBytes(32).toString("hex");
    const newKeyHash = await bcrypt.hash(newRawKey, 10);
    const newKeyPrefix = newRawKey.substring(0, 8);

    // Calculate new expiration (90 days from now)
    const newExpiresAt = new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000
    );

    // Update the record with the new key
    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        keyHash: newKeyHash,
        keyPrefix: newKeyPrefix,
        expiresAt: newExpiresAt,
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
      action: "apikey.rotated",
      resourceType: "ApiKey",
      resourceId: id,
      details: {
        name: apiKey.name,
        oldKeyPrefix: apiKey.keyPrefix,
        newKeyPrefix,
      },
      result: "success",
      request,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      key: newRawKey,
      keyPrefix: newKeyPrefix,
      role: updated.role.name,
      expiresAt: updated.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[API] api-keys/[id] PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
