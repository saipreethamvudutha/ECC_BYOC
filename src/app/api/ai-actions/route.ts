import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "ai.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

  const actions = await prisma.aiAction.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    actions.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      riskLevel: a.riskLevel,
      status: a.status,
      config: safeParse(a.config),
      approvedAt: a.approvedAt?.toISOString() || null,
      executedAt: a.executedAt?.toISOString() || null,
      expiresAt: a.expiresAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
    }))
  );
}
