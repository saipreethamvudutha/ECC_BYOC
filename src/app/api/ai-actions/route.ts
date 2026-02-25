import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      config: JSON.parse(a.config),
      approvedAt: a.approvedAt?.toISOString() || null,
      executedAt: a.executedAt?.toISOString() || null,
      expiresAt: a.expiresAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
    }))
  );
}
