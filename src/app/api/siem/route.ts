import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "siem.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

  const tenantId = session.tenantId;

  const [events, alerts] = await Promise.all([
    prisma.siemEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.siemAlert.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        rule: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      source: e.source,
      severity: e.severity,
      category: e.category,
      title: e.title,
      details: safeParse(e.details),
      sourceIp: e.sourceIp,
      destIp: e.destIp,
      createdAt: e.createdAt.toISOString(),
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      title: a.title,
      description: a.description,
      status: a.status,
      ruleName: a.rule?.name || null,
      assignedTo: a.assignedTo,
      createdAt: a.createdAt.toISOString(),
      acknowledgedAt: a.acknowledgedAt?.toISOString() || null,
      resolvedAt: a.resolvedAt?.toISOString() || null,
    })),
  });
}
