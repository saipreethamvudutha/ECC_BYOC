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

  const canView = await rbac.checkCapability(session.id, session.tenantId, "asset.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const asset = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      group: { select: { name: true } },
      scanResults: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          scan: { select: { id: true, name: true } },
        },
      },
      assetTags: {
        include: {
          tag: { select: { id: true, key: true, value: true, color: true } },
        },
      },
    },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const safeParse = (str: string) => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  // Calculate risk score for this asset
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of asset.scanResults) {
    if (r.severity in severityCounts && r.status === "open") {
      severityCounts[r.severity as keyof typeof severityCounts]++;
    }
  }

  const openFindings = Object.values(severityCounts).reduce((a, b) => a + b, 0);
  const riskScore = openFindings > 0
    ? Math.min(100, Math.round(
        (severityCounts.critical * 40 + severityCounts.high * 25 +
         severityCounts.medium * 15 + severityCounts.low * 5) /
        openFindings * Math.min(openFindings / 2, 5)
      ))
    : 0;

  return NextResponse.json({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ipAddress: asset.ipAddress,
    hostname: asset.hostname,
    os: asset.os,
    criticality: asset.criticality,
    status: asset.status,
    metadata: safeParse(asset.metadata),
    groupName: asset.group?.name || null,
    lastScanAt: asset.lastScanAt?.toISOString() || null,
    createdAt: asset.createdAt.toISOString(),
    tags: asset.assetTags.map((at) => at.tag),
    riskScore,
    severityCounts,
    findings: asset.scanResults.map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      description: r.description,
      cveId: r.cveId,
      cvssScore: r.cvssScore,
      status: r.status,
      remediation: r.remediation,
      scanId: r.scan?.id,
      scanName: r.scan?.name,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
