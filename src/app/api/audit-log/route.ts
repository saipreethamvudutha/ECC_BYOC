import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs = await prisma.auditLog.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      actor: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      actorName: l.actor?.name || "System",
      actorEmail: l.actor?.email || null,
      actorType: l.actorType,
      action: l.action,
      resourceType: l.resourceType,
      resourceId: l.resourceId,
      details: JSON.parse(l.details),
      ipAddress: l.ipAddress,
      result: l.result,
      createdAt: l.createdAt.toISOString(),
    }))
  );
}
