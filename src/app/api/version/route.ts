import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/version
 *
 * Returns the current deployment version info.
 * Used to verify the browser is loading the latest deployment.
 * No authentication required — this is a health/diagnostic endpoint.
 */
export async function GET() {
  return NextResponse.json(
    {
      version: "4.1.0",
      buildId: process.env.NEXT_BUILD_ID || "dev",
      deployedAt: "2026-03-03T12:00:00Z",
      phase: "Phase 4 — Audit & Security",
      features: [
        "centralized-audit-logger",
        "session-management",
        "account-lockout",
        "api-key-lifecycle",
        "security-dashboard",
        "security-headers",
        "uuid-validation",
        "capability-provider",
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}
