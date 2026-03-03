/**
 * Centralized Audit Logger for BYOC Cybersecurity Platform
 *
 * Provides tamper-evident audit logging with SHA-256 hash chain integrity,
 * automatic categorization, severity assignment, and request metadata extraction.
 *
 * Design principles:
 * - Never throws: all errors are caught and logged to console.error so that
 *   audit logging failures never break the main application flow.
 * - Hash chain integrity: each log entry includes a SHA-256 hash linking it
 *   to the previous entry, enabling tamper detection via verifyAuditIntegrity().
 * - Auto-classification: category and severity are inferred from the action
 *   string and result, reducing boilerplate at call sites.
 */

import { prisma } from "./prisma";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActorType = "user" | "api_key" | "system" | "ai_agent";
type AuditResult = "success" | "denied" | "error";

export interface CreateAuditLogParams {
  tenantId: string;
  actorId?: string | null;
  actorType: ActorType;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  result: AuditResult;
  /** Pass the incoming NextRequest for automatic IP / user-agent extraction.
   *  Pass null for system-originated events. */
  request?: Request | null;
}

export interface AuditIntegrityResult {
  /** Whether the entire inspected chain is valid. */
  valid: boolean;
  /** Number of records inspected. */
  totalRecords: number;
  /** ISO-8601 timestamp of when the verification was performed. */
  checkedAt: string;
  /** ID of the first record whose hash did not match (if any). */
  firstInvalidId?: string;
  /** ISO-8601 timestamp of the first invalid record (if any). */
  firstInvalidAt?: string;
}

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

/**
 * Derives the audit category from the action string.
 *
 * Categories group related actions for filtering and reporting:
 *   auth     - authentication events (login, logout, failures)
 *   rbac     - role & capability changes
 *   data     - asset, tag, scope, scan, compliance, report operations
 *   admin    - user lifecycle & organisation management
 *   security - API key management
 *   system   - fallback for unrecognised actions
 */
export function getActionCategory(action: string): string {
  // Auth events
  if (
    action === "user.login" ||
    action === "user.logout" ||
    action === "user.login_failed"
  ) {
    return "auth";
  }

  // RBAC events
  if (action.startsWith("role.") || action.startsWith("capability.")) {
    return "rbac";
  }

  // Data events
  if (
    action.startsWith("asset.") ||
    action.startsWith("tag.") ||
    action.startsWith("scope.") ||
    action.startsWith("scan.") ||
    action.startsWith("compliance.") ||
    action.startsWith("report.")
  ) {
    return "data";
  }

  // Admin events — org-level and user lifecycle
  if (
    action.startsWith("admin.") ||
    action.startsWith("org.") ||
    action === "user.invited" ||
    action === "user.suspended" ||
    action === "user.reactivated" ||
    action === "user.updated" ||
    action.startsWith("user_scope.")
  ) {
    return "admin";
  }

  // Security events
  if (action.startsWith("apikey.")) {
    return "security";
  }

  return "system";
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

/**
 * Derives the severity level from the action string and result.
 *
 * Severity levels (ascending): info, low, medium, high, critical.
 *
 * The mapping prioritises specific actions first, then falls back to
 * result-based heuristics, and finally defaults to "info".
 */
export function getActionSeverity(action: string, result: string): string {
  // --- Critical actions ---
  if (action === "account.locked") return "critical";

  // --- High-severity actions ---
  if (action === "user.suspended") return "high";
  if (action === "role.deleted") return "high";
  if (action === "apikey.revoked") return "high";

  // --- Medium-severity actions ---
  if (action === "user.login_failed") return "medium";

  // --- Low-severity actions ---
  if (action === "role.created") return "low";
  if (action === "user.invited") return "low";
  if (action === "apikey.created") return "low";

  // --- Result-based fallbacks ---
  if (result === "denied") return "medium";
  if (result === "error") return "high";

  return "info";
}

// ---------------------------------------------------------------------------
// Hash chain helpers
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 integrity hash for an audit log entry.
 *
 * The hash links to the previous entry's hash (or "GENESIS" for the first
 * entry in a tenant's chain), creating a tamper-evident linked list.
 *
 * Input: `prevHash|tenantId|action|actorId|timestamp`
 */
function computeIntegrityHash(
  prevHash: string,
  tenantId: string,
  action: string,
  actorId: string | null | undefined,
  timestamp: string
): string {
  const payload = `${prevHash}|${tenantId}|${action}|${actorId || "system"}|${timestamp}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Request metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the client IP address from common proxy headers.
 * Checks in order: x-forwarded-for (first entry), x-real-ip, cf-connecting-ip.
 */
function extractIpAddress(request: Request | null | undefined): string | null {
  if (!request || !("headers" in request)) return null;

  const headers = request.headers;

  // x-forwarded-for may contain a comma-separated list; take the first (client) IP
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  return null;
}

/**
 * Extracts the User-Agent header from the request.
 */
function extractUserAgent(
  request: Request | null | undefined
): string | null {
  if (!request || !("headers" in request)) return null;
  return request.headers.get("user-agent") || null;
}

// ---------------------------------------------------------------------------
// Core: createAuditLog
// ---------------------------------------------------------------------------

/**
 * Creates a new audit log entry with automatic categorisation, severity
 * assignment, request metadata extraction, and SHA-256 hash chain linking.
 *
 * This function **never throws**. If anything goes wrong the error is logged
 * to `console.error` and `null` is returned so that the calling code is
 * never disrupted by an audit subsystem failure.
 *
 * @example
 * ```ts
 * await createAuditLog({
 *   tenantId: session.tenantId,
 *   actorId: session.userId,
 *   actorType: "user",
 *   action: "role.assigned",
 *   resourceType: "Role",
 *   resourceId: roleId,
 *   details: { roleName, targetUserId },
 *   result: "success",
 *   request: req,
 * });
 * ```
 */
export async function createAuditLog(
  params: CreateAuditLogParams
) {
  try {
    const {
      tenantId,
      actorId,
      actorType,
      action,
      resourceType,
      resourceId,
      details,
      result,
      request,
    } = params;

    // --- Extract request metadata ---
    const ipAddress = extractIpAddress(request);
    const userAgent = extractUserAgent(request);

    // --- Auto-assign category and severity ---
    const category = getActionCategory(action);
    const severity = getActionSeverity(action, result);

    // --- Compute hash chain ---
    // Fetch the most recent audit log entry for this tenant to chain from.
    const previousLog = await prisma.auditLog.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { integrityHash: true },
    });

    const prevHash = previousLog?.integrityHash || "GENESIS";
    const timestamp = new Date().toISOString();
    const integrityHash = computeIntegrityHash(
      prevHash,
      tenantId,
      action,
      actorId,
      timestamp
    );

    // --- Persist the audit log entry ---
    const entry = await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actorId ?? null,
        actorType,
        action,
        resourceType: resourceType ?? null,
        resourceId: resourceId ?? null,
        details: details ? JSON.stringify(details) : "{}",
        ipAddress,
        userAgent,
        result,
        category,
        severity,
        integrityHash,
      },
    });

    return entry;
  } catch (error) {
    // Audit logging must never break the main application flow.
    console.error("[AuditLog] Failed to create audit log entry:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Integrity verification
// ---------------------------------------------------------------------------

/**
 * Verifies the SHA-256 hash chain for a tenant's audit log entries.
 *
 * Walks all entries in ascending chronological order and recomputes each
 * hash, comparing it against the stored `integrityHash`. If any entry has
 * been tampered with (modified, inserted, or deleted), the recomputed hash
 * will diverge from the stored one.
 *
 * @param tenantId  - The tenant whose audit trail to verify.
 * @param startDate - Optional lower bound (inclusive) for the date range.
 * @param endDate   - Optional upper bound (inclusive) for the date range.
 * @returns An {@link AuditIntegrityResult} describing the outcome.
 *
 * @example
 * ```ts
 * const result = await verifyAuditIntegrity(tenantId);
 * if (!result.valid) {
 *   console.warn("Tamper detected at", result.firstInvalidId);
 * }
 * ```
 */
export async function verifyAuditIntegrity(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<AuditIntegrityResult> {
  try {
    // Build the date filter for the main query
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // --- Determine the previous hash to start from ---
    let prevHash = "GENESIS";

    if (hasDateFilter && startDate) {
      // If we are verifying a sub-range, we need the hash of the entry
      // immediately preceding the start date so the chain is anchored.
      const precedingEntry = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          createdAt: { lt: startDate },
        },
        orderBy: { createdAt: "desc" },
        select: { integrityHash: true },
      });

      if (precedingEntry?.integrityHash) {
        prevHash = precedingEntry.integrityHash;
      }
      // If no preceding entry exists the chain starts from GENESIS.
    }

    // --- Load entries in ascending order ---
    const entries = await prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(hasDateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tenantId: true,
        action: true,
        actorId: true,
        integrityHash: true,
        createdAt: true,
      },
    });

    // --- Walk the chain ---
    for (const entry of entries) {
      const expectedHash = computeIntegrityHash(
        prevHash,
        entry.tenantId,
        entry.action,
        entry.actorId,
        entry.createdAt.toISOString()
      );

      if (expectedHash !== entry.integrityHash) {
        return {
          valid: false,
          totalRecords: entries.length,
          checkedAt: new Date().toISOString(),
          firstInvalidId: entry.id,
          firstInvalidAt: entry.createdAt.toISOString(),
        };
      }

      // Advance the chain
      prevHash = entry.integrityHash!;
    }

    return {
      valid: true,
      totalRecords: entries.length,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[AuditLog] Integrity verification failed:", error);

    // On error we report invalid with zero records so callers know
    // the verification could not be completed.
    return {
      valid: false,
      totalRecords: 0,
      checkedAt: new Date().toISOString(),
    };
  }
}
