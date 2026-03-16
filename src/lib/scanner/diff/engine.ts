/**
 * Scan Diff Engine
 * Computes delta between two completed scans.
 * Uses deterministic fingerprinting to match findings across scans.
 */

import { prisma } from '@/lib/prisma';

export interface FindingRef {
  scanResultId: string;
  target: string;
  title: string;
  severity: string;
  cveId?: string | null;
  cvssScore?: number | null;
  checkModule: string;
}

export interface ChangedFindingRef extends FindingRef {
  baseSeverity: string;
  baseCvssScore?: number | null;
  direction: 'escalated' | 'improved';
}

export interface DiffData {
  new: FindingRef[];
  resolved: FindingRef[];
  persistent: FindingRef[];
  changed: ChangedFindingRef[];
}

export interface DiffSummary {
  newCount: number;
  resolvedCount: number;
  persistentCount: number;
  changedCount: number;
  riskTrend: 'increasing' | 'decreasing' | 'stable';
  diffData: DiffData;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function fingerprintFinding(result: {
  assetId: string | null;
  title: string;
  details: string;
}): string {
  let checkModule = 'unknown';
  try {
    const d = JSON.parse(result.details || '{}');
    if (d.checkModule) checkModule = String(d.checkModule);
  } catch {
    // ignore parse errors
  }
  const slug = result.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 64);
  return `${result.assetId ?? 'no-asset'}:${checkModule}:${slug}`;
}

function toRef(result: {
  id: string;
  assetId: string | null;
  title: string;
  severity: string;
  cveId: string | null;
  cvssScore: number | null;
  details: string;
}): FindingRef {
  let checkModule = 'unknown';
  try {
    const d = JSON.parse(result.details || '{}');
    if (d.checkModule) checkModule = String(d.checkModule);
  } catch {
    // ignore
  }
  return {
    scanResultId: result.id,
    target: result.assetId ?? 'unknown',
    title: result.title,
    severity: result.severity,
    cveId: result.cveId,
    cvssScore: result.cvssScore,
    checkModule,
  };
}

export async function computeDiff(
  baseScanId: string,
  newScanId: string,
  tenantId: string
): Promise<DiffSummary> {
  const [baseResults, newResults] = await Promise.all([
    prisma.scanResult.findMany({
      where: { scanId: baseScanId, tenantId },
      select: { id: true, assetId: true, title: true, severity: true, cveId: true, cvssScore: true, details: true },
    }),
    prisma.scanResult.findMany({
      where: { scanId: newScanId, tenantId },
      select: { id: true, assetId: true, title: true, severity: true, cveId: true, cvssScore: true, details: true },
    }),
  ]);

  const baseMap = new Map(baseResults.map((r) => [fingerprintFinding(r), r]));
  const newMap = new Map(newResults.map((r) => [fingerprintFinding(r), r]));

  const newFindings: FindingRef[] = [];
  const resolved: FindingRef[] = [];
  const persistent: FindingRef[] = [];
  const changed: ChangedFindingRef[] = [];

  for (const [fp, r] of newMap) {
    const base = baseMap.get(fp);
    if (!base) {
      newFindings.push(toRef(r));
    } else if (base.severity !== r.severity || base.cvssScore !== r.cvssScore) {
      const baseRank = SEVERITY_RANK[base.severity] ?? 1;
      const newRank = SEVERITY_RANK[r.severity] ?? 1;
      changed.push({
        ...toRef(r),
        baseSeverity: base.severity,
        baseCvssScore: base.cvssScore,
        direction: newRank > baseRank ? 'escalated' : 'improved',
      });
    } else {
      persistent.push(toRef(r));
    }
  }

  for (const [fp, r] of baseMap) {
    if (!newMap.has(fp)) {
      resolved.push(toRef(r));
    }
  }

  // Risk trend: if new critical/high findings > resolved critical/high → increasing
  const newHighCrit = newFindings.filter(f => ['critical', 'high'].includes(f.severity)).length;
  const resolvedHighCrit = resolved.filter(f => ['critical', 'high'].includes(f.severity)).length;
  const escalatedCount = changed.filter(f => f.direction === 'escalated').length;
  const improvedCount = changed.filter(f => f.direction === 'improved').length;

  let riskTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (newHighCrit + escalatedCount > resolvedHighCrit + improvedCount) riskTrend = 'increasing';
  else if (resolvedHighCrit + improvedCount > newHighCrit + escalatedCount) riskTrend = 'decreasing';

  return {
    newCount: newFindings.length,
    resolvedCount: resolved.length,
    persistentCount: persistent.length,
    changedCount: changed.length,
    riskTrend,
    diffData: { new: newFindings, resolved, persistent, changed },
  };
}
