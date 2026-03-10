/**
 * GET /api/cron/scan-scheduler — Vercel Cron endpoint for scheduled scans
 *
 * Phase 11: Checks for scans with scheduleCron set and creates new instances.
 * Vercel hits this endpoint on the schedule defined in vercel.json.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find scans with scheduleCron set and completed status
  const scheduledScans = await prisma.scan.findMany({
    where: {
      scheduleCron: { not: null },
      status: { in: ["completed", "queued"] },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["name"],
    take: 20,
  });

  const results: { scanId: string; name: string; action: string }[] = [];

  for (const scan of scheduledScans) {
    if (!scan.scheduleCron) continue;

    // Check if enough time has elapsed since last run
    const isDue = isCronDue(scan.scheduleCron, scan.completedAt || scan.createdAt);
    if (!isDue) continue;

    try {
      // Create a new scan instance from the template
      const newScan = await prisma.scan.create({
        data: {
          tenantId: scan.tenantId,
          name: `${scan.name} (Scheduled)`,
          type: scan.type,
          status: "queued",
          targets: scan.targets,
          config: scan.config,
          progress: JSON.stringify({
            completedChecks: [],
            currentBatch: 0,
            totalBatches: 0,
            totalFindings: 0,
            checkResults: {},
          }),
          scheduleCron: scan.scheduleCron,
          createdById: scan.createdById,
        },
      });

      results.push({
        scanId: newScan.id,
        name: newScan.name,
        action: "created",
      });
    } catch (err) {
      results.push({
        scanId: scan.id,
        name: scan.name,
        action: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    timestamp: new Date().toISOString(),
    results,
  });
}

/**
 * Simple cron interval checker.
 * Supports common patterns: every N hours, daily, weekly.
 */
function isCronDue(cron: string, lastRun: Date): boolean {
  const now = Date.now();
  const lastRunMs = lastRun.getTime();
  const hoursSinceLastRun = (now - lastRunMs) / 3600000;

  // "*/N * * * *" → every N minutes
  const minMatch = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*/);
  if (minMatch) {
    const minutes = parseInt(minMatch[1], 10);
    return hoursSinceLastRun >= minutes / 60;
  }

  // "0 */N * * *" → every N hours
  const hourMatch = cron.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    return hoursSinceLastRun >= hours;
  }

  // "0 0 * * *" → daily
  if (cron === "0 0 * * *") return hoursSinceLastRun >= 24;

  // "0 0 * * 0" → weekly (Sunday)
  if (cron === "0 0 * * 0") return hoursSinceLastRun >= 168;

  // "0 0 1 * *" → monthly
  if (cron === "0 0 1 * *") return hoursSinceLastRun >= 720;

  // Default: every 24 hours
  return hoursSinceLastRun >= 24;
}
