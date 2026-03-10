import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

function safeJsonParse(str: string | null | undefined, fallback: unknown = []) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canView = await rbac.checkCapability(session.id, session.tenantId, "siem.view");
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const incident = await prisma.siemIncident.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      alerts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          mitreTactic: true,
          mitreTechnique: true,
          mitreAttackId: true,
          confidenceScore: true,
          createdAt: true,
        },
      },
    },
  });

  if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  return NextResponse.json({
    ...incident,
    timeline: safeJsonParse(incident.timeline, []),
    evidence: safeJsonParse(incident.evidence, []),
    impactedUsers: safeJsonParse(incident.impactedUsers, []),
    impactedAssets: safeJsonParse(incident.impactedAssets, []),
    remediationSteps: safeJsonParse(incident.remediationSteps, []),
    mitreTactics: safeJsonParse(incident.mitreTactics, []),
    mitreTechniques: safeJsonParse(incident.mitreTechniques, []),
    complianceMapping: safeJsonParse(incident.complianceMapping, []),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "siem.incident.manage");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const existing = await prisma.siemIncident.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  const validStatuses = ["open", "investigating", "contained", "eradicated", "recovered", "closed"];

  if (body.status !== undefined) {
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Valid: ${validStatuses.join(", ")}` }, { status: 400 });
    }
    updates.status = body.status;
    const now = new Date();
    if (body.status === "contained") updates.containedAt = now;
    if (body.status === "recovered" || body.status === "closed") updates.resolvedAt = existing.resolvedAt || now;
    if (body.status === "closed") updates.closedAt = now;
  }

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.severity !== undefined) updates.severity = body.severity;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
  if (body.assignedToName !== undefined) updates.assignedToName = body.assignedToName;
  if (body.impactSummary !== undefined) updates.impactSummary = body.impactSummary;
  if (body.rootCause !== undefined) updates.rootCause = body.rootCause;

  // Handle timeline entries
  if (body.timelineEntry) {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { name: true },
    });
    const existingTimeline = safeJsonParse(existing.timeline, []) as Array<Record<string, unknown>>;
    existingTimeline.push({
      timestamp: new Date().toISOString(),
      action: body.timelineEntry.action || "Status updated",
      actor: user?.name || session.id,
      details: body.timelineEntry.details || `Status changed to ${body.status || "updated"}`,
    });
    updates.timeline = JSON.stringify(existingTimeline);
  }

  // Handle evidence
  if (body.evidence !== undefined) {
    updates.evidence = JSON.stringify(body.evidence);
  }

  // Handle remediation steps
  if (body.remediationSteps !== undefined) {
    updates.remediationSteps = JSON.stringify(body.remediationSteps);
  }

  // Handle compliance mapping
  if (body.complianceMapping !== undefined) {
    updates.complianceMapping = JSON.stringify(body.complianceMapping);
  }

  const incident = await prisma.siemIncident.update({
    where: { id },
    data: updates,
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.incident.updated",
    resourceType: "siem_incident",
    resourceId: id,
    result: "success",
    details: { title: incident.title, changes: Object.keys(updates) },
    request,
  });

  return NextResponse.json({
    ...incident,
    timeline: safeJsonParse(incident.timeline, []),
    evidence: safeJsonParse(incident.evidence, []),
    impactedUsers: safeJsonParse(incident.impactedUsers, []),
    impactedAssets: safeJsonParse(incident.impactedAssets, []),
    remediationSteps: safeJsonParse(incident.remediationSteps, []),
    mitreTactics: safeJsonParse(incident.mitreTactics, []),
    mitreTechniques: safeJsonParse(incident.mitreTechniques, []),
    complianceMapping: safeJsonParse(incident.complianceMapping, []),
  });
}
