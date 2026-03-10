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

  const rule = await prisma.siemRule.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      alerts: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          createdAt: true,
        },
      },
      _count: { select: { alerts: true } },
    },
  });

  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  return NextResponse.json({
    ...rule,
    condition: safeJsonParse(rule.condition, {}),
    dataSources: safeJsonParse(rule.dataSources, []),
    alertCount: rule._count.alerts,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "siem.rule.manage");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const existing = await prisma.siemRule.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.severity !== undefined) updates.severity = body.severity;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.condition !== undefined) {
    updates.condition = typeof body.condition === "string" ? body.condition : JSON.stringify(body.condition);
  }
  if (body.ruleType !== undefined) updates.ruleType = body.ruleType;
  if (body.mitreAttackId !== undefined) updates.mitreAttackId = body.mitreAttackId;
  if (body.mitreTactic !== undefined) updates.mitreTactic = body.mitreTactic;
  if (body.mitreTechnique !== undefined) updates.mitreTechnique = body.mitreTechnique;
  if (body.confidenceLevel !== undefined) updates.confidenceLevel = body.confidenceLevel;
  if (body.category !== undefined) updates.category = body.category;
  if (body.dataSources !== undefined) {
    updates.dataSources = JSON.stringify(body.dataSources);
  }

  const rule = await prisma.siemRule.update({
    where: { id },
    data: updates,
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.rule.updated",
    resourceType: "siem_rule",
    resourceId: id,
    result: "success",
    details: { ruleName: rule.name, changes: Object.keys(updates) },
    request,
  });

  return NextResponse.json(rule);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "siem.rule.manage");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const existing = await prisma.siemRule.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  await prisma.siemRule.delete({ where: { id } });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.rule.deleted",
    resourceType: "siem_rule",
    resourceId: id,
    result: "success",
    details: { ruleName: existing.name },
    request,
  });

  return NextResponse.json({ message: "Rule deleted" });
}
