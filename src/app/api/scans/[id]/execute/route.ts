import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { executeNextBatch } from "@/lib/scanner";
import { createAuditLog } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canExecute = await rbac.checkCapability(session.id, session.tenantId, "scan.execute");
  if (!canExecute) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify scan belongs to tenant
  const scan = await prisma.scan.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (scan.status === "completed") {
    return NextResponse.json({ error: "Scan already completed" }, { status: 400 });
  }

  if (scan.status === "cancelled" || scan.status === "failed") {
    return NextResponse.json({ error: `Scan is ${scan.status}` }, { status: 400 });
  }

  try {
    const result = await executeNextBatch(id);

    // Log first execution and completion
    if (result.progress.currentBatch === 1) {
      await createAuditLog({
        tenantId: session.tenantId,
        actorId: session.id,
        actorType: "user",
        action: "scan.executed",
        resourceType: "scan",
        resourceId: id,
        result: "success",
        details: { scanName: scan.name, scanType: scan.type },
        request,
      });
    }

    if (result.status === "completed") {
      await createAuditLog({
        tenantId: session.tenantId,
        actorId: session.id,
        actorType: "user",
        action: "scan.completed",
        resourceType: "scan",
        resourceId: id,
        result: "success",
        details: {
          scanName: scan.name,
          totalFindings: result.progress.totalFindings,
        },
        request,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Scan execution error:", error);

    await prisma.scan.update({
      where: { id },
      data: { status: "failed" },
    });

    return NextResponse.json(
      { error: "Scan execution failed", details: String(error) },
      { status: 500 }
    );
  }
}
