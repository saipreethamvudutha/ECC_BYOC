import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { verifyAuditIntegrity } from "@/lib/audit";

/**
 * GET /api/audit-log/integrity
 *
 * Verify the SHA-256 hash chain integrity of the tenant's audit log.
 * Capability: admin.audit.view
 *
 * Returns: { valid, totalRecords, checkedAt, firstInvalidId?, firstInvalidAt? }
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
      "admin.audit.view"
    );
    if (!hasCapability) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await verifyAuditIntegrity(session.tenantId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] audit-log/integrity error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
