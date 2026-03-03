import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "scan.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

  const scans = await prisma.scan.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { results: true } },
    },
  });

  return NextResponse.json(
    scans.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      status: s.status,
      targets: safeParse(s.targets),
      resultsCount: s._count.results,
      startedAt: s.startedAt?.toISOString() || null,
      completedAt: s.completedAt?.toISOString() || null,
      createdAt: s.createdAt.toISOString(),
    }))
  );
}
