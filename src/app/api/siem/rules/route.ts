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
  const isActive = searchParams.get("isActive");
  const ruleType = searchParams.get("ruleType");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (severity) where.severity = severity;
  if (isActive !== null && isActive !== undefined && isActive !== "") {
    where.isActive = isActive === "true";
  }
  if (ruleType) where.ruleType = ruleType;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { mitreAttackId: { contains: search, mode: "insensitive" } },
    ];
  }

  const [rules, total] = await Promise.all([
    prisma.siemRule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { alerts: true } },
      },
    }),
    prisma.siemRule.count({ where }),
  ]);

  return NextResponse.json({
    rules: rules.map((r) => ({
      ...r,
      dataSources: safeJsonParse(r.dataSources, []),
      alertCount: r._count.alerts,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "siem.rule.manage");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { name, description, severity, condition, ruleType, mitreAttackId, mitreTactic, mitreTechnique, confidenceLevel, category, dataSources } = body;

  if (!name || !severity || !condition) {
    return NextResponse.json({ error: "name, severity, and condition are required" }, { status: 400 });
  }

  const rule = await prisma.siemRule.create({
    data: {
      tenantId: session.tenantId,
      name,
      description: description || "",
      severity,
      condition: typeof condition === "string" ? condition : JSON.stringify(condition),
      isActive: true,
      ruleType: ruleType || "correlation",
      mitreAttackId: mitreAttackId || null,
      mitreTactic: mitreTactic || null,
      mitreTechnique: mitreTechnique || null,
      confidenceLevel: confidenceLevel || 75,
      category: category || null,
      dataSources: dataSources ? JSON.stringify(dataSources) : "[]",
    },
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.rule.created",
    resourceType: "siem_rule",
    resourceId: rule.id,
    result: "success",
    details: { ruleName: name, severity, ruleType: ruleType || "correlation" },
    request,
  });

  return NextResponse.json(rule, { status: 201 });
}

function safeJsonParse(str: string | null | undefined, fallback: unknown = []) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
