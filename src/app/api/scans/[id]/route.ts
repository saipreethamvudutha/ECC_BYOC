import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "scan.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const scan = await prisma.scan.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      results: {
        select: { severity: true },
      },
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const safeParse = (str: string) => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  // Count findings by severity
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of scan.results) {
    if (r.severity in severityCounts) {
      severityCounts[r.severity as keyof typeof severityCounts]++;
    }
  }

  return NextResponse.json({
    id: scan.id,
    name: scan.name,
    type: scan.type,
    status: scan.status,
    targets: safeParse(scan.targets),
    config: safeParse(scan.config),
    progress: safeParse(scan.progress),
    startedAt: scan.startedAt?.toISOString() || null,
    completedAt: scan.completedAt?.toISOString() || null,
    createdAt: scan.createdAt.toISOString(),
    resultsCount: scan.results.length,
    severityCounts,
  });
}
