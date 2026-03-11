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
        // Track errors in progress for unreachable target detection
        if (!progress.checkResults[`_errors_${check.id}`]) {
          progress.checkResults[`_errors_${check.id}`] = 0;
        }
        (progress.checkResults[`_errors_${check.id}`] as number)++;
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

  // Detect if all checks errored with no findings (unreachable target)
  const totalErrors = Object.keys(progress.checkResults)
    .filter(k => k.startsWith("_errors_"))
    .reduce((sum, k) => sum + (progress.checkResults[k] as number), 0);
  const allErrored = allDone && progress.totalFindings === 0 && totalErrors > 0;
  const finalStatus = allDone ? (allErrored ? "failed" : "completed") : "running";

  await prisma.scan.update({
    where: { id: scanId },
    data: {
      status: finalStatus,
      completedAt: allDone ? new Date() : undefined,
      progress: JSON.stringify(progress),
    },
  });

  if (allDone && !allErrored) {
    await runPostScanHooks(scanId, scan.tenantId);
  }

  return {
    status: finalStatus,
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
      // Look up target asset for enrichment
      const targetHost = targets[0]?.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
      const targetAsset = targetHost ? await prisma.asset.findFirst({
        where: { tenantId, OR: [{ ipAddress: targetHost }, { hostname: targetHost }] },
        select: { name: true, hostname: true, ipAddress: true, criticality: true },
      }) : null;

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
          // ECS enrichment fields (Phase 10)
          hostName: targetAsset?.hostname || targetHost || null,
          hostIp: targetAsset?.ipAddress || targets[0] || null,
          assetCriticality: targetAsset?.criticality || null,
          dataset: "scanner.vulnerability",
          module: "byoc_scanner",
          logLevel: f.severity === "critical" ? "critical" : "warning",
        })),
      });

      // Phase 11: Run detection rules against scanner-created events
      try {
        const { evaluateRules, createAlertFromMatch } = await import("@/lib/siem/rule-engine");
        const { findMatchingPlaybooks, executePlaybook } = await import("@/lib/soar/playbooks");

        const activeRules = await prisma.siemRule.findMany({
          where: { tenantId, isActive: true },
        });

        // Evaluate each created event against active rules
        const createdEvents = await prisma.siemEvent.findMany({
          where: { tenantId, details: { contains: scanId } },
          orderBy: { createdAt: "desc" },
          take: criticalHighFindings.length,
        });

        for (const evt of createdEvents) {
          const matches = await evaluateRules(evt, activeRules);
          for (const match of matches) {
            const alert = await createAlertFromMatch(match, evt, tenantId);
            // Run SOAR playbooks
            const pbs = findMatchingPlaybooks(
              { severity: alert.severity, title: alert.title, mitreAttackId: alert.mitreAttackId },
              match.ruleName
            );
            for (const pb of pbs) {
              await executePlaybook(alert.id, {
                tenantId, severity: alert.severity, title: alert.title,
                mitreAttackId: match.mitreAttackId, mitreTactic: match.mitreTactic,
                mitreTechnique: match.mitreTechnique,
              }, pb);
            }
          }
        }
      } catch (ruleErr) {
        console.error("Scanner rule evaluation error:", ruleErr);
      }

      // Fallback: Create basic alerts if no rules matched (backward compatibility)
      const criticalFindings = scan.results.filter((r) => r.severity === "critical");
      const existingAlerts = await prisma.siemAlert.count({
        where: { tenantId, description: { contains: scanId } },
      });
      if (criticalFindings.length > 0 && existingAlerts === 0) {
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
              ruleType: "correlation",
              category: "vulnerability",
              dataSources: JSON.stringify(["scanner"]),
              confidenceLevel: 90,
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
            confidenceScore: 90,
            priorityScore: 90,
            assetCriticalityWeight: targetAsset?.criticality || null,
            impactedAssets: JSON.stringify(targetAsset ? [targetAsset.name || targetAsset.hostname] : []),
          })),
        });
      }
    }

    // 2. Update Asset records with discovery data + lastScanAt
    for (const target of targets) {
      const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
      const matchingAssets = await prisma.asset.findMany({
        where: {
          tenantId,
          OR: [{ ipAddress: host }, { hostname: host }, { name: host }],
        },
        select: { id: true },
      });

      // Base update: lastScanAt + discoveryMethod
      const updateData: Record<string, unknown> = {
        lastScanAt: new Date(),
        discoveryMethod: scan.type === "discovery" ? "scanner" : undefined,
        discoveredAt: scan.type === "discovery" ? new Date() : undefined,
      };

      // Extract OS fingerprint data from scan results
      const osResult = scan.results.find((r) => {
        try {
          const details = JSON.parse(r.details);
          return details.checkModule === "os-fingerprint" && details.osFamily && details.osFamily !== "Unknown";
        } catch { return false; }
      });
      if (osResult) {
        try {
          const details = JSON.parse(osResult.details);
          const osDisplay = details.osVersion
            ? `${details.osFamily} (${details.osVersion})`
            : details.osFamily;
          updateData.os = osDisplay;
        } catch { /* ignore */ }
      }

      // Extract service detection data
      const serviceResult = scan.results.find((r) => {
        try {
          const details = JSON.parse(r.details);
          return details.checkModule === "service-detection" && details.services;
        } catch { return false; }
      });
      if (serviceResult) {
        try {
          const details = JSON.parse(serviceResult.details);
          if (details.services) {
            updateData.services = JSON.stringify(details.services);
          }
        } catch { /* ignore */ }
      }

      // Extract open ports from port scan
      const portResult = scan.results.find((r) => {
        try {
          const details = JSON.parse(r.details);
          return details.checkModule === "port-scan" && details.ports;
        } catch { return false; }
      });
      if (portResult) {
        try {
          const details = JSON.parse(portResult.details);
          if (details.ports) {
            updateData.openPorts = JSON.stringify(details.ports.map((p: { port: number }) => p.port));
          }
        } catch { /* ignore */ }
      }

      // Extract network discovery data (device type, manufacturer)
      const discoveryResult = scan.results.find((r) => {
        try {
          const details = JSON.parse(r.details);
          return details.checkModule === "network-discovery" && details.deviceType;
        } catch { return false; }
      });
      if (discoveryResult) {
        try {
          const details = JSON.parse(discoveryResult.details);
          if (details.deviceType && details.deviceType !== "unknown") {
            updateData.networkRole = details.deviceType;
            // Map device type to asset type
            const typeMap: Record<string, string> = {
              "network_device": "network_device",
              "printer": "iot_device",
              "iot_device": "iot_device",
              "workstation": "workstation",
              "server": "server",
            };
            if (typeMap[details.deviceType]) {
              updateData.type = typeMap[details.deviceType];
            }
          }
        } catch { /* ignore */ }
      }

      // Extract cloud provider info
      const cloudResult = scan.results.find((r) => {
        try {
          const details = JSON.parse(r.details);
          return details.checkModule === "cloud-inventory" && details.provider;
        } catch { return false; }
      });
      if (cloudResult) {
        try {
          const details = JSON.parse(cloudResult.details);
          if (details.provider) {
            updateData.type = "cloud_resource";
            updateData.manufacturer = details.providerName || details.provider;
          }
        } catch { /* ignore */ }
      }

      // Clean up undefined values
      const cleanData = Object.fromEntries(
        Object.entries(updateData).filter(([, v]) => v !== undefined)
      );

      for (const asset of matchingAssets) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: cleanData,
        });
      }
    }

    // 3. Compliance automation — map scan findings to compliance controls (Phase 11)
    try {
      const { updateComplianceFromScan } = await import("@/lib/compliance/automation");
      await updateComplianceFromScan(scanId, tenantId);
    } catch (compError) {
      console.error("Compliance automation error:", compError);
    }

    // 4. Create AI action suggestions for critical findings
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
