import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

/**
 * GET /api/audit-log/export
 *
 * Export audit logs as CSV or JSON.
 * Capability: admin.audit.export
 *
 * Query params:
 *   format   - "csv" | "json" (default: "json")
 *   action   - filter by action string
 *   result   - filter by result (success, denied, error)
 *   category - filter by category
 *   severity - filter by severity (info, warning, critical)
 *   from     - ISO date lower bound
 *   to       - ISO date upper bound
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCapability = await rbac.checkCapability(
      session.id,
      session.tenantId,
      "admin.audit.export"
    );
    if (!hasCapability) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";
    const action = searchParams.get("action");
    const result = searchParams.get("result");
    const category = searchParams.get("category");
    const severity = searchParams.get("severity");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (format !== "csv" && format !== "json") {
      return NextResponse.json(
        { error: "Invalid format. Use 'csv' or 'json'." },
        { status: 400 }
      );
    }

    // Build Prisma WHERE clause
    const where: Record<string, unknown> = {
      tenantId: session.tenantId,
    };

    if (action) {
      where.action = action;
    }
    if (result) {
      where.result = result;
    }
    if (category) {
      where.category = category;
    }
    if (severity) {
      where.severity = severity;
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.createdAt = dateFilter;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: {
        actor: { select: { name: true, email: true } },
      },
    });

    // Build filters summary for audit log
    const filters: Record<string, string> = {};
    if (action) filters.action = action;
    if (result) filters.result = result;
    if (category) filters.category = category;
    if (severity) filters.severity = severity;
    if (from) filters.from = from;
    if (to) filters.to = to;

    // Create audit trail for the export
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "audit.exported",
      resourceType: "AuditLog",
      details: { format, recordCount: logs.length, filters },
      result: "success",
      request,
    });

    if (format === "csv") {
      const headers = [
        "id",
        "actorName",
        "actorEmail",
        "actorType",
        "action",
        "resourceType",
        "resourceId",
        "details",
        "ipAddress",
        "userAgent",
        "result",
        "category",
        "severity",
        "createdAt",
      ];

      const escapeCSV = (value: string | null | undefined): string => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = logs.map((l) =>
        [
          escapeCSV(l.id),
          escapeCSV(l.actor?.name || "System"),
          escapeCSV(l.actor?.email || null),
          escapeCSV(l.actorType),
          escapeCSV(l.action),
          escapeCSV(l.resourceType),
          escapeCSV(l.resourceId),
          escapeCSV(l.details),
          escapeCSV(l.ipAddress),
          escapeCSV(l.userAgent),
          escapeCSV(l.result),
          escapeCSV(l.category),
          escapeCSV(l.severity),
          escapeCSV(l.createdAt.toISOString()),
        ].join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-log-export-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // JSON format
    const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };
    const jsonData = logs.map((l) => ({
      id: l.id,
      actorName: l.actor?.name || "System",
      actorEmail: l.actor?.email || null,
      actorType: l.actorType,
      action: l.action,
      resourceType: l.resourceType,
      resourceId: l.resourceId,
      details: safeParse(l.details),
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      result: l.result,
      category: l.category,
      severity: l.severity,
      createdAt: l.createdAt.toISOString(),
    }));

    return new NextResponse(JSON.stringify(jsonData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("[API] audit-log/export error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
