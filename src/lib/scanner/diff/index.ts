/**
 * Scan Diff Public API
 * Computes diff and persists to ScanDiff table (with SIEM event hook for new critical findings).
 */

import { prisma } from '@/lib/prisma';
import { computeDiff, type DiffSummary } from './engine';

export { computeDiff, type DiffSummary, type FindingRef, type ChangedFindingRef, type DiffData } from './engine';

export async function computeAndPersistDiff(
  baseScanId: string,
  newScanId: string,
  tenantId: string
): Promise<{ id: string } & DiffSummary> {
  const summary = await computeDiff(baseScanId, newScanId, tenantId);

  // Upsert the diff record
  const existing = await prisma.scanDiff.findUnique({
    where: { baseScanId_newScanId: { baseScanId, newScanId } },
  });

  let diffRecord;
  if (existing) {
    diffRecord = await prisma.scanDiff.update({
      where: { id: existing.id },
      data: {
        computedAt: new Date(),
        newCount: summary.newCount,
        resolvedCount: summary.resolvedCount,
        persistentCount: summary.persistentCount,
        changedCount: summary.changedCount,
        diffData: JSON.stringify(summary.diffData),
      },
    });
  } else {
    diffRecord = await prisma.scanDiff.create({
      data: {
        tenantId,
        baseScanId,
        newScanId,
        newCount: summary.newCount,
        resolvedCount: summary.resolvedCount,
        persistentCount: summary.persistentCount,
        changedCount: summary.changedCount,
        diffData: JSON.stringify(summary.diffData),
      },
    });
  }

  // Create SIEM events for new critical/high findings
  const newCritHighFindings = summary.diffData.new.filter(f => ['critical', 'high'].includes(f.severity));
  if (newCritHighFindings.length > 0) {
    const siemEvents = newCritHighFindings.slice(0, 10).map(f => ({
      tenantId,
      source: 'scanner_diff',
      severity: f.severity,
      category: 'vulnerability',
      title: `[Diff] ${f.title}`,
      details: JSON.stringify({ diffId: diffRecord.id, finding: f }),
    }));

    try {
      await prisma.siemEvent.createMany({ data: siemEvents });
    } catch {
      // Non-fatal if SIEM events fail
    }
  }

  return { id: diffRecord.id, ...summary };
}
