import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

/**
 * GET /api/audit-log — Enhanced audit log with server-side filtering & pagination
 *
 * Query params:
 *   action   - Filter by action string (exact match)
 *   result   - Filter by result (success/denied/error)
 *   category - Filter by category (auth/rbac/data/admin/security/system)
 *   actorId  - Filter by actor user ID
 *   severity - Filter by severity (info/low/medium/high/critical)
 *   from     - ISO date, lower bound (inclusive)
 *   to       - ISO date, upper bound (inclusive)
 *   cursor   - Cursor for pagination (format: "createdAt|id")
 *   limit    - Page size (default 50, max 200)
 *
 * Requires: admin.audit.view
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(
    session.id,
    session.tenantId,
    "admin.audit.view"
  );
  if (!canView) {
    return NextResponse.json(
      { error: "Forbidden: missing admin.audit.view capability" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const result = searchParams.get("result");
  const category = searchParams.get("category");
  const actorId = searchParams.get("actorId");
  const severity = searchParams.get("severity");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");

  const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 200);

  // Build WHERE clause
  const where: Record<string, unknown> = { tenantId: session.tenantId };

  if (action) where.action = action;
  if (result) where.result = result;
  if (category) where.category = category;
  if (actorId) where.actorId = actorId;
  if (severity) where.severity = severity;

  // Date range filter
  if (from || to) {
    const createdAtFilter: Record<string, Date> = {};
    if (from) createdAtFilter.gte = new Date(from);
    if (to) createdAtFilter.lte = new Date(to);
    where.createdAt = createdAtFilter;
  }

  // Cursor-based pagination: cursor format is "ISO_DATE|UUID"
  if (cursor) {
    const [cursorDate, cursorId] = cursor.split("|");
    if (cursorDate && cursorId) {
      where.OR = [
        { createdAt: { lt: new Date(cursorDate) } },
        { createdAt: new Date(cursorDate), id: { lt: cursorId } },
      ];
    }
  }

  // Fetch logs + 1 extra to check if there are more pages
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      actor: { select: { name: true, email: true } },
    },
  });

  // Determine if there's a next page
  const hasMore = logs.length > limit;
  const pageResults = hasMore ? logs.slice(0, limit) : logs;

  // Build next cursor from last item
  let nextCursor: string | null = null;
  if (hasMore && pageResults.length > 0) {
    const last = pageResults[pageResults.length - 1];
    nextCursor = `${last.createdAt.toISOString()}|${last.id}`;
  }

  // Get total count for the filtered query (without cursor/limit)
  const countWhere: Record<string, unknown> = { tenantId: session.tenantId };
  if (action) countWhere.action = action;
  if (result) countWhere.result = result;
  if (category) countWhere.category = category;
  if (actorId) countWhere.actorId = actorId;
  if (severity) countWhere.severity = severity;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    countWhere.createdAt = dateFilter;
  }

  const totalCount = await prisma.auditLog.count({ where: countWhere });

  // Get available filter values for the UI
  const [actionValues, categoryValues] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: session.tenantId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: session.tenantId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);

  const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

  return NextResponse.json({
    logs: pageResults.map((l) => ({
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
    })),
    nextCursor,
    totalCount,
    filters: {
      actions: actionValues.map((a) => a.action),
      categories: categoryValues.map((c) => c.category).filter(Boolean),
    },
  });
}
