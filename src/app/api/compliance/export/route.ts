import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * GET /api/compliance/export
 *
 * Export compliance frameworks and controls as CSV or JSON.
 * Follows the same pattern as /api/audit-log/export.
 *
 * Query params:
 *   format    - "csv" | "json" (default: "json")
 *   framework - "all" | frameworkId
 *
 * Capability: compliance.export
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCapability = await rbac.checkCapability(
      session.id, session.tenantId, "compliance.export"
    );
    if (!hasCapability) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";
    const frameworkFilter = searchParams.get("framework") || "all";

    if (format !== "csv" && format !== "json") {
      return NextResponse.json(
        { error: "Invalid format. Use 'csv' or 'json'." },
        { status: 400 }
      );
    }

    // Build where clause
    const where: Record<string, unknown> = {
      tenantId: session.tenantId,
      isActive: true,
    };
    if (frameworkFilter !== "all") {
      where.id = frameworkFilter;
    }

    const frameworks = await prisma.complianceFramework.findMany({
      where,
      include: {
        controls: { orderBy: { controlId: "asc" } },
      },
      orderBy: { name: "asc" },
    });

    // Audit the export
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "compliance.exported",
      resourceType: "ComplianceFramework",
      details: {
        format,
        frameworkFilter,
        frameworkCount: frameworks.length,
        controlCount: frameworks.reduce((sum, fw) => sum + fw.controls.length, 0),
      },
      result: "success",
      request,
    });

    const datestamp = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      const headers = [
        "Framework", "Version", "ControlID", "Title", "Category",
        "Status", "LastAssessedAt", "NextReviewAt", "EvidenceCount", "Notes",
      ];

      const escapeCSV = (value: string | null | undefined): string => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows: string[] = [];
      for (const fw of frameworks) {
        for (const c of fw.controls) {
          const evidenceCount = JSON.parse(c.evidence || "[]").length;
          rows.push([
            escapeCSV(fw.name),
            escapeCSV(fw.version),
            escapeCSV(c.controlId),
            escapeCSV(c.title),
            escapeCSV(c.category),
            escapeCSV(c.status),
            escapeCSV(c.lastAssessedAt?.toISOString() || null),
            escapeCSV(c.nextReviewAt?.toISOString() || null),
            String(evidenceCount),
            escapeCSV(c.notes),
          ].join(","));
        }
      }

      const csv = [headers.join(","), ...rows].join("\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="compliance-export-${datestamp}.csv"`,
        },
      });
    }

    // JSON format — full structure with stats
    const jsonData = frameworks.map((fw) => {
      const total = fw.controls.length;
      const compliant = fw.controls.filter((c) => c.status === "compliant").length;
      const partial = fw.controls.filter((c) => c.status === "partially_compliant").length;
      const nonCompliant = fw.controls.filter((c) => c.status === "non_compliant").length;
      const notAssessed = fw.controls.filter((c) => c.status === "not_assessed").length;
      const notApplicable = fw.controls.filter((c) => c.status === "not_applicable").length;
      const applicableTotal = total - notApplicable;
      const score = applicableTotal > 0
        ? Math.round(((compliant + partial * 0.5) / applicableTotal) * 100)
        : 0;

      return {
        framework: fw.name,
        version: fw.version,
        description: fw.description,
        stats: { total, compliant, partial, nonCompliant, notAssessed, notApplicable, score },
        controls: fw.controls.map((c) => ({
          controlId: c.controlId,
          title: c.title,
          category: c.category,
          status: c.status,
          evidence: JSON.parse(c.evidence || "[]"),
          notes: c.notes,
          lastAssessedAt: c.lastAssessedAt?.toISOString() || null,
          nextReviewAt: c.nextReviewAt?.toISOString() || null,
        })),
      };
    });

    return new NextResponse(JSON.stringify(jsonData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="compliance-export-${datestamp}.json"`,
      },
    });
  } catch (error) {
    console.error("[API] compliance/export error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
