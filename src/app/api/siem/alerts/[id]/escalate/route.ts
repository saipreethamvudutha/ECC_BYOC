import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return []; } };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canEscalate = await rbac.checkCapability(session.id, session.tenantId, "siem.escalate");
  if (!canEscalate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tenantId = session.tenantId;

  const alert = await prisma.siemAlert.findFirst({
    where: { id, tenantId },
  });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  if (alert.incidentId) {
    return NextResponse.json({ error: "Alert is already linked to an incident", incidentId: alert.incidentId }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { title, description, priority } = body as { title?: string; description?: string; priority?: string };

  // Look up the user who is escalating
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true },
  });

  const now = new Date();
  const mitreTactics = alert.mitreTactic ? [alert.mitreTactic] : [];
  const mitreTechniques = alert.mitreTechnique ? [alert.mitreTechnique] : [];

  // Create the incident
  const incident = await prisma.siemIncident.create({
    data: {
      tenantId,
      title: title || `Incident: ${alert.title}`,
      description: description || alert.description || `Incident escalated from alert: ${alert.title}`,
      severity: alert.severity,
      status: "investigating",
      priority: priority || (alert.severity === "critical" ? "critical" : alert.severity === "high" ? "high" : "medium"),
      escalatedBy: session.id,
      escalatedByName: user?.name || null,
      impactedUsers: alert.impactedUsers,
      impactedAssets: alert.impactedAssets,
      mitreTactics: JSON.stringify(mitreTactics),
      mitreTechniques: JSON.stringify(mitreTechniques),
      detectedAt: alert.createdAt,
      acknowledgedAt: now,
      timeline: JSON.stringify([{
        timestamp: now.toISOString(),
        action: "Incident created from alert escalation",
        actor: user?.name || session.id,
        details: `Alert "${alert.title}" escalated to incident by ${user?.name || "analyst"}`,
      }]),
    },
  });

  // Link the alert to the incident
  await prisma.siemAlert.update({
    where: { id },
    data: { incidentId: incident.id, status: "investigating" },
  });

  // Audit log
  await createAuditLog({
    tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.alert.escalated",
    resourceType: "siem_alert",
    resourceId: id,
    result: "success",
    details: {
      alertTitle: alert.title,
      incidentId: incident.id,
      incidentTitle: incident.title,
    },
    request,
  });

  return NextResponse.json({
    id: incident.id,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    message: "Alert escalated to incident",
  }, { status: 201 });
}
