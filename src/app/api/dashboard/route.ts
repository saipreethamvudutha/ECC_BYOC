import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

// Force dynamic — never cache this route
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "dash.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.tenantId;

  // Parallel queries for dashboard stats
  const [
    totalAssets,
    scanResults,
    activeScans,
    openAlerts,
    pendingAiActions,
    complianceControls,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.asset.count({ where: { tenantId } }),
    prisma.scanResult.groupBy({
      by: ["severity"],
      where: { tenantId },
      _count: true,
    }),
    prisma.scan.count({ where: { tenantId, status: { in: ["running", "queued"] } } }),
    prisma.siemAlert.count({ where: { tenantId, status: { in: ["open", "investigating"] } } }),
    prisma.aiAction.count({ where: { tenantId, status: "pending" } }),
    prisma.complianceControl.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: true,
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);

  // Calculate severity counts
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of scanResults) {
    if (r.severity in severityCounts) {
      severityCounts[r.severity as keyof typeof severityCounts] = r._count;
    }
  }

  // Calculate compliance score
  const totalControls = complianceControls.reduce((sum, c) => sum + c._count, 0);
  const compliantCount = complianceControls.find(c => c.status === "compliant")?._count || 0;
  const partialCount = complianceControls.find(c => c.status === "partially_compliant")?._count || 0;
  const complianceScore = totalControls > 0
    ? Math.round(((compliantCount + partialCount * 0.5) / totalControls) * 100)
    : 0;

  // Risk score (based on vulnerability severities)
  const totalFindings = Object.values(severityCounts).reduce((a, b) => a + b, 0);
  const riskScore = totalFindings > 0
    ? Math.min(100, Math.round(
        (severityCounts.critical * 40 + severityCounts.high * 25 + severityCounts.medium * 15 + severityCounts.low * 5) /
        totalFindings * (totalFindings / 3)
      ))
    : 0;

  // Format compliance overview by framework
  const frameworks = await prisma.complianceFramework.findMany({
    where: { tenantId },
    include: {
      controls: {
        select: { status: true },
      },
    },
  });

  const complianceOverview = frameworks.map(fw => {
    const total = fw.controls.length;
    const comp = fw.controls.filter(c => c.status === "compliant").length;
    const partial = fw.controls.filter(c => c.status === "partially_compliant").length;
    const nonComp = fw.controls.filter(c => c.status === "non_compliant").length;
    const notAssessed = fw.controls.filter(c => c.status === "not_assessed").length;
    return {
      framework: fw.name,
      version: fw.version,
      totalControls: total,
      compliant: comp,
      partiallyCompliant: partial,
      nonCompliant: nonComp,
      notAssessed,
      score: total > 0 ? Math.round(((comp + partial * 0.5) / total) * 100) : 0,
    };
  });

  // Format recent activity
  const recentActivity = recentAuditLogs.map(log => ({
    id: log.id,
    action: log.action,
    actorName: log.actor?.name || "System",
    actorType: log.actorType,
    result: log.result,
    details: log.details,
    createdAt: log.createdAt.toISOString(),
  }));

  const response = NextResponse.json({
    stats: {
      totalAssets,
      criticalVulnerabilities: severityCounts.critical,
      activeScans,
      complianceScore,
      openAlerts,
      pendingAiActions,
      riskScore,
      totalFindings,
    },
    severityCounts,
    complianceOverview,
    recentActivity,
  });

  // Prevent all caching of dashboard data
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}
