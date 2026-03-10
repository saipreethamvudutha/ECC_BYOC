import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return []; } };
const safeParseObj = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canView = await rbac.checkCapability(session.id, session.tenantId, "siem.view");
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const alert = await prisma.siemAlert.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      rule: true,
      event: true,
    },
  });

  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  return NextResponse.json({
    id: alert.id,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    status: alert.status,
    assignedTo: alert.assignedTo,
    assignedToName: alert.assignedToName,
    mitreAttackId: alert.mitreAttackId,
    mitreTactic: alert.mitreTactic,
    mitreTechnique: alert.mitreTechnique,
    confidenceScore: alert.confidenceScore,
    assetCriticalityWeight: alert.assetCriticalityWeight,
    priorityScore: alert.priorityScore,
    incidentId: alert.incidentId,
    impactedUsers: safeParse(alert.impactedUsers),
    impactedAssets: safeParse(alert.impactedAssets),
    relatedAlertIds: safeParse(alert.relatedAlertIds),
    threatIntel: safeParseObj(alert.threatIntel),
    acknowledgedAt: alert.acknowledgedAt?.toISOString() || null,
    containedAt: alert.containedAt?.toISOString() || null,
    resolvedAt: alert.resolvedAt?.toISOString() || null,
    closedAt: alert.closedAt?.toISOString() || null,
    createdAt: alert.createdAt.toISOString(),
    rule: alert.rule ? {
      id: alert.rule.id,
      name: alert.rule.name,
      description: alert.rule.description,
      ruleType: alert.rule.ruleType,
      severity: alert.rule.severity,
      mitreAttackId: alert.rule.mitreAttackId,
      mitreTactic: alert.rule.mitreTactic,
      mitreTechnique: alert.rule.mitreTechnique,
      confidenceLevel: alert.rule.confidenceLevel,
    } : null,
    event: alert.event ? {
      id: alert.event.id,
      source: alert.event.source,
      severity: alert.event.severity,
      category: alert.event.category,
      title: alert.event.title,
      details: safeParseObj(alert.event.details),
      sourceIp: alert.event.sourceIp,
      sourcePort: alert.event.sourcePort,
      destIp: alert.event.destIp,
      destPort: alert.event.destPort,
      protocol: alert.event.protocol,
      direction: alert.event.direction,
      userName: alert.event.userName,
      eventOutcome: alert.event.eventOutcome,
      eventAction: alert.event.eventAction,
      processName: alert.event.processName,
      processPid: alert.event.processPid,
      hostName: alert.event.hostName,
      hostIp: alert.event.hostIp,
      geoCountry: alert.event.geoCountry,
      threatIntelHit: alert.event.threatIntelHit,
      assetCriticality: alert.event.assetCriticality,
      dataset: alert.event.dataset,
      module: alert.event.module,
      createdAt: alert.event.createdAt.toISOString(),
    } : null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAck = await rbac.checkCapability(session.id, session.tenantId, "siem.acknowledge");
  if (!canAck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const alert = await prisma.siemAlert.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, status: true, title: true },
  });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const body = await request.json();
  const { status, assignedTo, assignedToName } = body;

  const validStatuses = ["open", "triaging", "investigating", "contained", "resolved", "closed", "false_positive"];

  const data: Record<string, unknown> = {};
  if (status) {
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }
    data.status = status;
    // Set timestamps based on status transitions
    if (["triaging", "investigating"].includes(status) && !alert.status.match(/triaging|investigating/)) {
      data.acknowledgedAt = new Date();
    }
    if (status === "contained") data.containedAt = new Date();
    if (status === "resolved") data.resolvedAt = new Date();
    if (status === "closed" || status === "false_positive") data.closedAt = new Date();
  }
  if (assignedTo !== undefined) data.assignedTo = assignedTo;
  if (assignedToName !== undefined) data.assignedToName = assignedToName;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.siemAlert.update({
    where: { id },
    data,
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.alert.updated",
    resourceType: "siem_alert",
    resourceId: id,
    result: "success",
    details: {
      alertTitle: alert.title,
      previousStatus: alert.status,
      newStatus: status || alert.status,
      assignedTo: assignedTo || undefined,
    },
    request,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    message: `Alert updated successfully`,
  });
}
