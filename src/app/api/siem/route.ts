import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return []; } };
const safeParseObj = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "siem.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.tenantId;
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "events";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const severity = url.searchParams.get("severity");
  const category = url.searchParams.get("category");
  const source = url.searchParams.get("source");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");

  const skip = (page - 1) * limit;

  // ── Events tab ──
  if (tab === "events") {
    const where: Record<string, unknown> = { tenantId };
    if (severity) where.severity = severity;
    if (category) where.category = category;
    if (source) where.source = source;
    if (search) where.title = { contains: search, mode: "insensitive" };

    const [events, total] = await Promise.all([
      prisma.siemEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.siemEvent.count({ where }),
    ]);

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        source: e.source,
        severity: e.severity,
        category: e.category,
        title: e.title,
        details: safeParseObj(e.details),
        sourceIp: e.sourceIp,
        sourcePort: e.sourcePort,
        destIp: e.destIp,
        destPort: e.destPort,
        protocol: e.protocol,
        direction: e.direction,
        userName: e.userName,
        eventOutcome: e.eventOutcome,
        eventAction: e.eventAction,
        processName: e.processName,
        hostName: e.hostName,
        hostIp: e.hostIp,
        geoCountry: e.geoCountry,
        threatIntelHit: e.threatIntelHit,
        assetCriticality: e.assetCriticality,
        dataset: e.dataset,
        module: e.module,
        createdAt: e.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  // ── Alerts tab ──
  if (tab === "alerts") {
    const where: Record<string, unknown> = { tenantId };
    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (search) where.title = { contains: search, mode: "insensitive" };

    const [alerts, total] = await Promise.all([
      prisma.siemAlert.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          rule: { select: { name: true } },
        },
      }),
      prisma.siemAlert.count({ where }),
    ]);

    return NextResponse.json({
      alerts: alerts.map((a) => ({
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
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  // ── Incidents tab ──
  if (tab === "incidents") {
    const where: Record<string, unknown> = { tenantId };
    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (search) where.title = { contains: search, mode: "insensitive" };

    const [incidents, total] = await Promise.all([
      prisma.siemIncident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { _count: { select: { alerts: true } } },
      }),
      prisma.siemIncident.count({ where }),
    ]);

    return NextResponse.json({
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        severity: i.severity,
        status: i.status,
        priority: i.priority,
        assignedTo: i.assignedTo,
        assignedToName: i.assignedToName,
        alertCount: i._count.alerts,
        slaBreached: i.slaBreached,
        detectedAt: i.detectedAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  return NextResponse.json({ error: "Invalid tab parameter" }, { status: 400 });
}
