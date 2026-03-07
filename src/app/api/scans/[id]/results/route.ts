import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export async function GET(
  request: NextRequest,
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

  // Verify scan belongs to tenant
  const scan = await prisma.scan.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const severity = url.searchParams.get("severity");
  const status = url.searchParams.get("status");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  const where: Record<string, unknown> = {
    scanId: id,
    tenantId: session.tenantId,
  };
  if (severity) where.severity = severity;
  if (status) where.status = status;

  const safeParse = (str: string) => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  const [results, total] = await Promise.all([
    prisma.scanResult.findMany({
      where,
      orderBy: [
        { severity: "asc" }, // critical first (alphabetical: c < h < i < l < m)
        { cvssScore: "desc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        asset: { select: { id: true, name: true, ipAddress: true } },
      },
    }),
    prisma.scanResult.count({ where }),
  ]);

  // Custom sort order since alphabetical doesn't match severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sorted = results.sort(
    (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
  );

  return NextResponse.json({
    results: sorted.map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      description: r.description,
      cveId: r.cveId,
      cvssScore: r.cvssScore,
      status: r.status,
      remediation: r.remediation,
      details: safeParse(r.details),
      asset: r.asset
        ? { id: r.asset.id, name: r.asset.name, ipAddress: r.asset.ipAddress }
        : null,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
