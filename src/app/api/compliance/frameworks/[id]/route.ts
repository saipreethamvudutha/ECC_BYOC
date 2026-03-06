import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * PATCH /api/compliance/frameworks/[id]
 *
 * Update a compliance framework's settings (isActive, description).
 * Deactivating a framework hides it from the main view but preserves all data.
 *
 * Capability: compliance.manage
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
      session.id, session.tenantId, "compliance.manage"
    );
    if (!hasCapability) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isActive, description } = body;

    // Verify framework belongs to tenant
    const framework = await prisma.complianceFramework.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!framework) {
      return NextResponse.json({ error: "Framework not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (typeof description === "string") updateData.description = description;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update. Provide isActive (boolean) or description (string)." },
        { status: 400 }
      );
    }

    const updated = await prisma.complianceFramework.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "compliance.framework.updated",
      resourceType: "ComplianceFramework",
      resourceId: id,
      details: {
        frameworkName: framework.name,
        changes: updateData,
        previousIsActive: framework.isActive,
      },
      result: "success",
      request,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      version: updated.version,
      description: updated.description,
      isActive: updated.isActive,
      message: `Framework "${framework.name}" updated`,
    });
  } catch (error) {
    console.error("[API] compliance/frameworks/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
