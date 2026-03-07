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

  const canExport = await rbac.checkCapability(session.id, session.tenantId, "scan.export");
  if (!canExport) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const scan = await prisma.scan.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      results: {
        orderBy: { createdAt: "desc" },
        include: {
          asset: { select: { name: true, ipAddress: true } },
        },
      },
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";

  const safeParse = (str: string) => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  if (format === "csv") {
    const headers = [
      "ID", "Severity", "Title", "CVE ID", "CVSS Score", "Status",
      "Description", "Remediation", "Asset", "Asset IP", "Created At",
    ];

    const rows = scan.results.map((r) => [
      r.id,
      r.severity,
      `"${(r.title || "").replace(/"/g, '""')}"`,
      r.cveId || "",
      r.cvssScore?.toString() || "",
      r.status,
      `"${(r.description || "").replace(/"/g, '""')}"`,
      `"${(r.remediation || "").replace(/"/g, '""')}"`,
      r.asset?.name || "",
      r.asset?.ipAddress || "",
      r.createdAt.toISOString(),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="scan-${scan.name.replace(/\s+/g, "-")}-${id.slice(0, 8)}.csv"`,
      },
    });
  }

  // JSON format
  const data = {
    scan: {
      id: scan.id,
      name: scan.name,
      type: scan.type,
      status: scan.status,
      targets: safeParse(scan.targets),
      startedAt: scan.startedAt?.toISOString() || null,
      completedAt: scan.completedAt?.toISOString() || null,
      createdAt: scan.createdAt.toISOString(),
    },
    totalFindings: scan.results.length,
    findings: scan.results.map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      cveId: r.cveId,
      cvssScore: r.cvssScore,
      status: r.status,
      description: r.description,
      remediation: r.remediation,
      details: safeParse(r.details),
      asset: r.asset ? { name: r.asset.name, ipAddress: r.asset.ipAddress } : null,
      createdAt: r.createdAt.toISOString(),
    })),
    exportedAt: new Date().toISOString(),
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="scan-${scan.name.replace(/\s+/g, "-")}-${id.slice(0, 8)}.json"`,
    },
  });
}
