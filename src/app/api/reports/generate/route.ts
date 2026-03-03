import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "report.create"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { type } = await request.json();

  const typeNames: Record<string, string> = {
    vulnerability: "Vulnerability Assessment Report",
    compliance: "Compliance Status Report",
    executive: "Executive Summary Report",
    technical: "Technical Deep Dive Report",
  };

  const name = typeNames[type] || `${type} Report`;

  const report = await prisma.report.create({
    data: {
      tenantId: session.tenantId,
      name,
      type,
      status: "generating",
      createdById: session.id,
    },
  });

  // Simulate report generation
  setTimeout(async () => {
    try {
      // Gather real data for the report
      const [assets, scanResults, complianceControls, siemAlerts] = await Promise.all([
        prisma.asset.count({ where: { tenantId: session.tenantId } }),
        prisma.scanResult.groupBy({
          by: ["severity"],
          where: { tenantId: session.tenantId },
          _count: true,
        }),
        prisma.complianceControl.groupBy({
          by: ["status"],
          where: { tenantId: session.tenantId },
          _count: true,
        }),
        prisma.siemAlert.count({
          where: { tenantId: session.tenantId, status: { in: ["open", "investigating"] } },
        }),
      ]);

      const reportData = {
        generatedAt: new Date().toISOString(),
        tenant: session.tenantName,
        summary: {
          totalAssets: assets,
          vulnerabilities: Object.fromEntries(
            scanResults.map((r) => [r.severity, r._count])
          ),
          complianceStatus: Object.fromEntries(
            complianceControls.map((c) => [c.status, c._count])
          ),
          openAlerts: siemAlerts,
        },
      };

      await prisma.report.update({
        where: { id: report.id },
        data: {
          status: "completed",
          data: JSON.stringify(reportData),
        },
      });
    } catch (error) {
      console.error("Report generation error:", error);
      await prisma.report.update({
        where: { id: report.id },
        data: { status: "failed" },
      });
    }
  }, 3000);

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "report.generated",
    resourceType: "report",
    resourceId: report.id,
    result: "success",
    details: { type, name },
    request,
  });

  return NextResponse.json({
    id: report.id,
    name: report.name,
    type: report.type,
    status: report.status,
    message: "Report generation started",
  });
}
