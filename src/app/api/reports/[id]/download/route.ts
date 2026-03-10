/**
 * GET /api/reports/[id]/download?format=csv|json
 *
 * Phase 11: Export report data as CSV or structured JSON.
 */

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

  const canExport = await rbac.checkCapability(
    session.id,
    session.tenantId,
    "report.export"
  );
  if (!canExport) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") || "json";

  const report = await prisma.report.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (report.status !== "completed" || !report.data) {
    return NextResponse.json(
      { error: "Report not yet completed" },
      { status: 400 }
    );
  }

  let reportData: Record<string, unknown>;
  try {
    reportData = JSON.parse(report.data);
  } catch {
    return NextResponse.json(
      { error: "Report data is corrupted" },
      { status: 500 }
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${report.type}-report-${timestamp}`;

  if (format === "csv") {
    const csv = convertToCSV(reportData);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // Default: JSON
  return new NextResponse(JSON.stringify(reportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

function convertToCSV(data: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("Section,Metric,Value");

  // Metadata
  if (data.generatedAt) lines.push(`Metadata,Generated At,"${data.generatedAt}"`);
  if (data.tenant) lines.push(`Metadata,Tenant,"${data.tenant}"`);
  if (data.reportType) lines.push(`Metadata,Report Type,"${data.reportType}"`);

  // Summary
  const summary = data.summary as Record<string, unknown> | undefined;
  if (summary) {
    if (summary.totalAssets !== undefined)
      lines.push(`Summary,Total Assets,${summary.totalAssets}`);
    if (summary.totalScans !== undefined)
      lines.push(`Summary,Total Scans,${summary.totalScans}`);
    if (summary.openAlerts !== undefined)
      lines.push(`Summary,Open Alerts,${summary.openAlerts}`);
    if (summary.activeIncidents !== undefined)
      lines.push(`Summary,Active Incidents,${summary.activeIncidents}`);

    // Vulnerabilities
    const vulns = summary.vulnerabilities as Record<string, number> | undefined;
    if (vulns) {
      for (const [sev, count] of Object.entries(vulns)) {
        lines.push(`Vulnerabilities,${sev},${count}`);
      }
    }

    // Compliance
    const compliance = summary.complianceStatus as Record<string, number> | undefined;
    if (compliance) {
      for (const [status, count] of Object.entries(compliance)) {
        lines.push(`Compliance,${status},${count}`);
      }
    }
  }

  return lines.join("\n");
}
