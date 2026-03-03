import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "risk.override"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { controlId, status, notes, evidence } = await request.json();

  if (!controlId || !status) {
    return NextResponse.json(
      { error: "Control ID and status are required" },
      { status: 400 }
    );
  }

  const validStatuses = ["compliant", "partially_compliant", "non_compliant", "not_assessed", "not_applicable"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify control belongs to tenant
  const control = await prisma.complianceControl.findFirst({
    where: { id: controlId, tenantId: session.tenantId },
  });

  if (!control) {
    return NextResponse.json({ error: "Control not found" }, { status: 404 });
  }

  const previousStatus = control.status;

  const updated = await prisma.complianceControl.update({
    where: { id: controlId },
    data: {
      status,
      notes: notes ?? control.notes,
      lastAssessedAt: new Date(),
      evidence: evidence ? JSON.stringify(evidence) : control.evidence,
    },
  });

  // Create assessment record
  await prisma.complianceAssessment.create({
    data: {
      tenantId: session.tenantId,
      controlId,
      assessorId: session.id,
      status,
      findings: notes || null,
    },
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "compliance.control.updated",
    resourceType: "compliance_control",
    resourceId: controlId,
    result: "success",
    details: {
      controlId: control.controlId,
      previousStatus,
      newStatus: status,
    },
    request,
  });

  return NextResponse.json({
    ...updated,
    message: `Control ${control.controlId} updated to ${status}`,
  });
}
