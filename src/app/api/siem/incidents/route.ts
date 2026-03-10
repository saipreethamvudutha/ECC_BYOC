import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canView = await rbac.checkCapability(session.id, session.tenantId, "siem.view");
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const severity = searchParams.get("severity");
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (severity) where.severity = severity;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [incidents, total] = await Promise.all([
    prisma.siemIncident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { alerts: true } },
      },
    }),
    prisma.siemIncident.count({ where }),
  ]);

  return NextResponse.json({
    incidents: incidents.map((i) => ({
      ...i,
      impactedUsers: safeJsonParse(i.impactedUsers, []),
      impactedAssets: safeJsonParse(i.impactedAssets, []),
      mitreTactics: safeJsonParse(i.mitreTactics, []),
      mitreTechniques: safeJsonParse(i.mitreTechniques, []),
      alertCount: i._count.alerts,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "siem.incident.manage");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { title, description, severity, priority } = body;

  if (!title || !severity) {
    return NextResponse.json({ error: "title and severity are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true },
  });

  const now = new Date();
  const incident = await prisma.siemIncident.create({
    data: {
      tenantId: session.tenantId,
      title,
      description: description || null,
      severity,
      status: "open",
      priority: priority || "medium",
      escalatedBy: session.id,
      escalatedByName: user?.name || null,
      detectedAt: now,
      timeline: JSON.stringify([{
        timestamp: now.toISOString(),
        action: "Incident created manually",
        actor: user?.name || session.id,
        details: `Incident "${title}" created by ${user?.name || "analyst"}`,
      }]),
    },
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.incident.created",
    resourceType: "siem_incident",
    resourceId: incident.id,
    result: "success",
    details: { title, severity, priority: priority || "medium" },
    request,
  });

  return NextResponse.json(incident, { status: 201 });
}

function safeJsonParse(str: string | null | undefined, fallback: unknown = []) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
