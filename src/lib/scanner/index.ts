/**
 * Scanner Engine — Core Orchestrator
 *
 * Manages chunked scan execution with database-driven state machine.
 * Each call to executeNextBatch() runs a batch of checks within
 * the Vercel serverless timeout (~8s), saves progress, and returns.
 *
 * The client polls /api/scans/[id]/execute until status is "completed".
 */

import { prisma } from "@/lib/prisma";
import { CheckResult, ScanProgress, BatchResult } from "./types";
import { builtinAdapter } from "./adapters/builtin";

const BATCH_SIZE = 2; // checks per batch (conservative for Vercel)
const BATCH_TIMEOUT_MS = 7000; // max time per batch (leave 3s margin for Vercel)

function parseProgress(progressStr: string): ScanProgress {
  try {
    const p = JSON.parse(progressStr);
    return {
      completedChecks: p.completedChecks || [],
      currentBatch: p.currentBatch || 0,
      totalBatches: p.totalBatches || 0,
      totalFindings: p.totalFindings || 0,
      checkResults: p.checkResults || {},
    };
  } catch {
    return {
      completedChecks: [],
      currentBatch: 0,
      totalBatches: 0,
      totalFindings: 0,
      checkResults: {},
    };
  }
}

export function initializeProgress(scanType: string): ScanProgress {
  const checks = builtinAdapter.getCheckModules(scanType);
  const totalBatches = Math.ceil(checks.length / BATCH_SIZE);
  return {
    completedChecks: [],
    currentBatch: 0,
    totalBatches,
    totalFindings: 0,
    checkResults: {},
  };
}

export async function executeNextBatch(scanId: string): Promise<BatchResult> {
  // 1. Load scan from DB
  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan) throw new Error("Scan not found");
  if (scan.status === "completed" || scan.status === "failed" || scan.status === "cancelled") {
    const progress = parseProgress(scan.progress);
    return { status: scan.status as "completed" | "failed", progress, newFindings: 0 };
  }

  const progress = parseProgress(scan.progress);
  const targets: string[] = JSON.parse(scan.targets);
  const allChecks = builtinAdapter.getCheckModules(scan.type);

  // Update total batches based on targets × checks
  const totalCheckRuns = allChecks.length; // checks per target
  progress.totalBatches = Math.ceil(totalCheckRuns / BATCH_SIZE);

  // 2. Mark as running if not already
  if (scan.status !== "running") {
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "running", startedAt: new Date() },
    });
  }

  // 3. Determine next batch of checks
  const remainingChecks = allChecks.filter(
    (c) => !progress.completedChecks.includes(c.id)
  );

  if (remainingChecks.length === 0) {
    // All checks done — complete the scan
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "completed",
        completedAt: new Date(),
        progress: JSON.stringify(progress),
      },
    });

    // Run post-scan hooks
    await runPostScanHooks(scanId, scan.tenantId);

    return { status: "completed", progress, newFindings: 0 };
  }

  const batchChecks = remainingChecks.slice(0, BATCH_SIZE);

  // 4. Run checks against all targets with timeout
  let newFindings = 0;
  const batchStartTime = Date.now();

  for (const check of batchChecks) {
    // Check if we're approaching the timeout
    if (Date.now() - batchStartTime > BATCH_TIMEOUT_MS) break;

    const allResults: (CheckResult & { target: string })[] = [];

    for (const target of targets) {
      if (Date.now() - batchStartTime > BATCH_TIMEOUT_MS) break;

      try {
        const results = await check.run(target);
        for (const r of results) {
          allResults.push({ ...r, target });
        }
      } catch (error) {
        console.error(`Check ${check.id} failed on ${target}:`, error);
      }
    }

    // 5. Save results to DB
    if (allResults.length > 0) {
      // Try to match targets to existing assets
      const assetMap = new Map<string, string>();
      for (const target of targets) {
        const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
        const asset = await prisma.asset.findFirst({
          where: {
            tenantId: scan.tenantId,
            OR: [
              { ipAddress: host },
              { hostname: host },
              { name: host },
            ],
          },
          select: { id: true },
        });
        if (asset) assetMap.set(target, asset.id);
      }

      await prisma.scanResult.createMany({
        data: allResults.map((r) => ({
          tenantId: scan.tenantId,
          scanId: scan.id,
          severity: r.severity,
          title: r.title,
          description: r.description,
          remediation: r.remediation,
          cveId: r.cveId || null,
          cvssScore: r.cvssScore || null,
          assetId: assetMap.get(r.target) || null,
          status: "open",
          details: JSON.stringify({ ...r.details, checkModule: check.id }),
        })),
      });

      newFindings += allResults.length;
    }

    // Update progress
    progress.completedChecks.push(check.id);
    progress.checkResults[check.id] = allResults.length;
    progress.totalFindings += allResults.length;
    progress.currentBatch++;
  }

  // 6. Save progress to DB
  const allDone = progress.completedChecks.length >= allChecks.length;

  await prisma.scan.update({
    where: { id: scanId },
    data: {
      status: allDone ? "completed" : "running",
      completedAt: allDone ? new Date() : undefined,
      progress: JSON.stringify(progress),
    },
  });

  if (allDone) {
    await runPostScanHooks(scanId, scan.tenantId);
  }

  return {
    status: allDone ? "completed" : "running",
    progress,
    newFindings,
  };
}

/**
 * Post-scan hooks: create SIEM events, update assets, create AI actions
 */
async function runPostScanHooks(scanId: string, tenantId: string) {
  try {
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: { results: true },
    });
    if (!scan) return;

    const targets: string[] = JSON.parse(scan.targets);

    // 1. Create SIEM events for critical and high findings
    const criticalHighFindings = scan.results.filter(
      (r) => r.severity === "critical" || r.severity === "high"
    );

    if (criticalHighFindings.length > 0) {
      await prisma.siemEvent.createMany({
        data: criticalHighFindings.map((f) => ({
          tenantId,
          source: "scanner",
          severity: f.severity,
          category: "vulnerability",
          title: `[Scan] ${f.title}`,
          details: JSON.stringify({
            scanId,
            scanName: scan.name,
            findingId: f.id,
            cveId: f.cveId,
            cvssScore: f.cvssScore,
            remediation: f.remediation,
          }),
          sourceIp: targets[0] || null,
          destIp: null,
        })),
      });

      // Create SIEM alert for critical findings
      const criticalFindings = scan.results.filter((r) => r.severity === "critical");
      if (criticalFindings.length > 0) {
        // Check if we have a default alert rule, create one if not
        let rule = await prisma.siemRule.findFirst({
          where: { tenantId, name: "Critical Vulnerability Detected" },
        });
        if (!rule) {
          rule = await prisma.siemRule.create({
            data: {
              tenantId,
              name: "Critical Vulnerability Detected",
              description: "Fires when a scan discovers a critical severity vulnerability",
              severity: "critical",
              condition: JSON.stringify({ severity: "critical", source: "scanner" }),
              isActive: true,
            },
          });
        }

        await prisma.siemAlert.createMany({
          data: criticalFindings.slice(0, 5).map((f) => ({
            tenantId,
            ruleId: rule!.id,
            severity: "critical",
            title: `Critical: ${f.title}`,
            description: f.description || `Critical vulnerability found during scan "${scan.name}"`,
            status: "open",
          })),
        });
      }
    }

    // 2. Update Asset.lastScanAt for matched targets
    for (const target of targets) {
      const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
      await prisma.asset.updateMany({
        where: {
          tenantId,
          OR: [{ ipAddress: host }, { hostname: host }, { name: host }],
        },
        data: { lastScanAt: new Date() },
      });
    }

    // 3. Create AI action suggestions for critical findings
    const criticals = scan.results.filter((r) => r.severity === "critical");
    if (criticals.length > 0) {
      await prisma.aiAction.createMany({
        data: criticals.slice(0, 3).map((f) => ({
          tenantId,
          type: "remediation",
          title: `Remediate: ${f.title}`,
          description: f.remediation || `Apply fix for ${f.cveId || "vulnerability"} found in scan "${scan.name}"`,
          riskLevel: "critical",
          status: "pending",
          config: JSON.stringify({
            scanId,
            findingId: f.id,
            cveId: f.cveId,
            target: targets[0],
            action: "patch",
          }),
        })),
      });
    }
  } catch (error) {
    console.error("Post-scan hooks error:", error);
  }
}

export { parseProgress };
