import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

const safeParse = (str: string): string[] => { try { return JSON.parse(str); } catch { return []; } };

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "siem.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.tenantId;
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Parallel queries for all metrics
  const [
    events24h,
    openAlerts,
    activeIncidents,
    allAlerts,
    recentAlerts,
    topRules,
    alertsWithEvents,
    resolvedAlerts,
  ] = await Promise.all([
    prisma.siemEvent.count({ where: { tenantId, createdAt: { gte: last24h } } }),
    prisma.siemAlert.count({ where: { tenantId, status: { in: ["open", "triaging", "investigating"] } } }),
    prisma.siemIncident.count({ where: { tenantId, status: { in: ["open", "investigating", "contained"] } } }),
    prisma.siemAlert.findMany({
      where: { tenantId },
      select: { severity: true, status: true, impactedAssets: true, createdAt: true },
    }),
    prisma.siemAlert.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { rule: { select: { name: true } } },
    }),
    prisma.siemRule.findMany({
      where: { tenantId },
      include: { _count: { select: { alerts: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.siemAlert.findMany({
      where: { tenantId, eventId: { not: null } },
      select: { createdAt: true, event: { select: { createdAt: true } } },
    }),
    prisma.siemAlert.findMany({
      where: { tenantId, status: { in: ["resolved", "closed"] }, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, closedAt: true },
    }),
  ]);

  // MTTD (Mean Time to Detect) — minutes
  let mttd = 0;
  if (alertsWithEvents.length > 0) {
    const totalMs = alertsWithEvents.reduce((sum, a) => {
      if (a.event) {
        return sum + (a.createdAt.getTime() - a.event.createdAt.getTime());
      }
      return sum;
    }, 0);
    mttd = Math.round(totalMs / alertsWithEvents.length / 60000); // minutes
  }

  // MTTR (Mean Time to Respond) — hours
  let mttr = 0;
  if (resolvedAlerts.length > 0) {
    const totalMs = resolvedAlerts.reduce((sum, a) => {
      const endTime = a.closedAt || a.resolvedAt;
      if (endTime) {
        return sum + (endTime.getTime() - a.createdAt.getTime());
      }
      return sum;
    }, 0);
    mttr = Math.round(totalMs / resolvedAlerts.length / 3600000 * 10) / 10; // hours, 1 decimal
  }

  // Security Posture Score (0-100, higher = better)
  const severityWeights: Record<string, number> = { critical: 15, high: 8, medium: 3, low: 1 };
  const openAlertsList = allAlerts.filter(a => ["open", "triaging", "investigating"].includes(a.status));
  const penalty = openAlertsList.reduce((sum, a) => sum + (severityWeights[a.severity] || 0), 0);
  const securityPostureScore = Math.max(0, Math.min(100, 100 - penalty));

  // Severity Distribution
  const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of allAlerts) {
    if (a.severity in severityCounts) {
      severityCounts[a.severity]++;
    }
  }
  const severityDistribution = Object.entries(severityCounts).map(([severity, count]) => ({ severity, count }));

  // Alert Volume by Hour (last 24h)
  const alertsByHour: { hour: string; count: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
    const hourEnd = new Date(now.getTime() - i * 60 * 60 * 1000);
    const count = allAlerts.filter(a => a.createdAt >= hourStart && a.createdAt < hourEnd).length;
    alertsByHour.push({ hour: hourEnd.toISOString(), count });
  }

  // Top 5 Triggered Rules
  const sortedRules = topRules
    .sort((a, b) => b._count.alerts - a._count.alerts)
    .slice(0, 5)
    .map(r => ({
      name: r.name,
      mitreAttackId: r.mitreAttackId || "",
      alertCount: r._count.alerts,
    }));

  // Top 5 Assets Under Attack
  const assetCounts: Record<string, number> = {};
  for (const a of openAlertsList) {
    const assets = safeParse(a.impactedAssets);
    for (const asset of assets) {
      if (typeof asset === "string" && asset) {
        assetCounts[asset] = (assetCounts[asset] || 0) + 1;
      }
    }
  }
  const topAssets = Object.entries(assetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([asset, alertCount]) => ({ asset, alertCount }));

  return NextResponse.json({
    securityPostureScore,
    openAlerts,
    activeIncidents,
    mttd,
    mttr,
    events24h,
    alertsByHour,
    severityDistribution,
    topRules: sortedRules,
    topAssets,
    recentAlerts: recentAlerts.map(a => ({
      id: a.id,
      severity: a.severity,
      title: a.title,
      description: a.description,
      status: a.status,
      assignedTo: a.assignedTo,
      assignedToName: a.assignedToName,
      mitreAttackId: a.mitreAttackId,
      mitreTactic: a.mitreTactic,
      mitreTechnique: a.mitreTechnique,
      confidenceScore: a.confidenceScore,
      priorityScore: a.priorityScore,
      incidentId: a.incidentId,
      ruleName: a.rule?.name || null,
      createdAt: a.createdAt.toISOString(),
      acknowledgedAt: a.acknowledgedAt?.toISOString() || null,
      resolvedAt: a.resolvedAt?.toISOString() || null,
    })),
  });
}
