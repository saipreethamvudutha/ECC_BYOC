import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; resultId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canExecute = await rbac.checkCapability(session.id, session.tenantId, "scan.execute");
  if (!canExecute) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, resultId } = await params;

  // Verify scan belongs to tenant
  const scan = await prisma.scan.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status } = body;

  const validStatuses = ["open", "acknowledged", "resolved", "false_positive"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const result = await prisma.scanResult.findFirst({
    where: { id: resultId, scanId: id, tenantId: session.tenantId },
  });

  if (!result) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  const updated = await prisma.scanResult.update({
    where: { id: resultId },
    data: { status },
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "scan.finding.updated",
    resourceType: "scan_result",
    resourceId: resultId,
    result: "success",
    details: {
      scanId: id,
      scanName: scan.name,
      findingTitle: result.title,
      previousStatus: result.status,
      newStatus: status,
    },
    request,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    message: `Finding status updated to ${status}`,
  });
}
