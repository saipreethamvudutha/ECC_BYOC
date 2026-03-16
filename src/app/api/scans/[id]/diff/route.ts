import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { rbac } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { computeAndPersistDiff } from '@/lib/scanner/diff';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: newScanId } = await params;
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.view');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const baseScanId = searchParams.get('baseScanId');
  if (!baseScanId) return NextResponse.json({ error: 'baseScanId query param required' }, { status: 400 });

  // Tenant isolation check
  const [baseScan, newScan] = await Promise.all([
    prisma.scan.findFirst({ where: { id: baseScanId, tenantId: user.tenantId } }),
    prisma.scan.findFirst({ where: { id: newScanId, tenantId: user.tenantId } }),
  ]);

  if (!baseScan || !newScan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

  const diff = await prisma.scanDiff.findUnique({
    where: { baseScanId_newScanId: { baseScanId, newScanId } },
  });

  if (!diff) return NextResponse.json({ error: 'Diff not yet computed. POST to this endpoint to compute it.' }, { status: 404 });

  return NextResponse.json({
    id: diff.id,
    baseScanId: diff.baseScanId,
    newScanId: diff.newScanId,
    computedAt: diff.computedAt,
    newCount: diff.newCount,
    resolvedCount: diff.resolvedCount,
    persistentCount: diff.persistentCount,
    changedCount: diff.changedCount,
    diffData: JSON.parse(diff.diffData),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: newScanId } = await params;
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.view');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { baseScanId } = body;
  if (!baseScanId) return NextResponse.json({ error: 'baseScanId is required' }, { status: 400 });

  if (baseScanId === newScanId) {
    return NextResponse.json({ error: 'baseScanId must be different from the current scan' }, { status: 400 });
  }

  // Tenant isolation + status checks
  const [baseScan, newScan] = await Promise.all([
    prisma.scan.findFirst({ where: { id: baseScanId, tenantId: user.tenantId } }),
    prisma.scan.findFirst({ where: { id: newScanId, tenantId: user.tenantId } }),
  ]);

  if (!baseScan || !newScan) return NextResponse.json({ error: 'One or both scans not found' }, { status: 404 });
  if (baseScan.status !== 'completed') return NextResponse.json({ error: 'Base scan must be completed' }, { status: 422 });
  if (newScan.status !== 'completed') return NextResponse.json({ error: 'Target scan must be completed' }, { status: 422 });

  // Check for recent cached diff (within 1 hour)
  const existing = await prisma.scanDiff.findUnique({
    where: { baseScanId_newScanId: { baseScanId, newScanId } },
  });

  if (existing) {
    const ageMs = Date.now() - existing.computedAt.getTime();
    if (ageMs < 60 * 60 * 1000) {
      return NextResponse.json({
        id: existing.id,
        baseScanId: existing.baseScanId,
        newScanId: existing.newScanId,
        computedAt: existing.computedAt,
        newCount: existing.newCount,
        resolvedCount: existing.resolvedCount,
        persistentCount: existing.persistentCount,
        changedCount: existing.changedCount,
        diffData: JSON.parse(existing.diffData),
        cached: true,
      });
    }
  }

  const result = await computeAndPersistDiff(baseScanId, newScanId, user.tenantId);

  await createAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actorType: 'user',
    action: 'scan.diff.computed',
    resourceType: 'scan_diff',
    resourceId: result.id,
    result: 'success',
    details: { baseScanId, newScanId, newCount: result.newCount, resolvedCount: result.resolvedCount },
    request,
  });

  return NextResponse.json({
    id: result.id,
    baseScanId,
    newScanId,
    computedAt: new Date(),
    newCount: result.newCount,
    resolvedCount: result.resolvedCount,
    persistentCount: result.persistentCount,
    changedCount: result.changedCount,
    riskTrend: result.riskTrend,
    diffData: result.diffData,
  }, { status: 201 });
}
