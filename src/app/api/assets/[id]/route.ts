import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(session.id, session.tenantId, "asset.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const asset = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      group: { select: { name: true } },
      scanResults: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          scan: { select: { id: true, name: true } },
        },
      },
      assetTags: {
        include: {
          tag: { select: { id: true, key: true, value: true, color: true } },
        },
      },
    },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const safeParse = (str: string) => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  // Calculate risk score for this asset
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of asset.scanResults) {
    if (r.severity in severityCounts && r.status === "open") {
      severityCounts[r.severity as keyof typeof severityCounts]++;
    }
  }

  const openFindings = Object.values(severityCounts).reduce((a, b) => a + b, 0);
  const riskScore = openFindings > 0
    ? Math.min(100, Math.round(
        (severityCounts.critical * 40 + severityCounts.high * 25 +
         severityCounts.medium * 15 + severityCounts.low * 5) /
        openFindings * Math.min(openFindings / 2, 5)
      ))
    : 0;

  return NextResponse.json({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ipAddress: asset.ipAddress,
    hostname: asset.hostname,
    os: asset.os,
    criticality: asset.criticality,
    status: asset.status,
    metadata: safeParse(asset.metadata),
    groupName: asset.group?.name || null,
    lastScanAt: asset.lastScanAt?.toISOString() || null,
    createdAt: asset.createdAt.toISOString(),
    tags: asset.assetTags.map((at) => at.tag),
    riskScore,
    severityCounts,
    // Phase 8: Discovery fields
    macAddress: asset.macAddress,
    manufacturer: asset.manufacturer,
    model: asset.model,
    firmware: asset.firmware,
    networkRole: asset.networkRole,
    services: safeParse(asset.services),
    openPorts: safeParse(asset.openPorts),
    discoveryMethod: asset.discoveryMethod,
    discoveredAt: asset.discoveredAt?.toISOString() || null,
    // Phase 9: Inventory fields
    serialNumber: asset.serialNumber,
    biosUuid: asset.biosUuid,
    physicalLocation: asset.physicalLocation,
    assetOwner: asset.assetOwner,
    subnet: asset.subnet,
    vlan: asset.vlan,
    installedSoftware: safeParse(asset.installedSoftware),
    userAccounts: safeParse(asset.userAccounts),
    // Phase 12D: denormalized vulnerability counts
    vulnerabilityCount: asset.vulnerabilityCount,
    criticalCount: asset.criticalCount,
    highCount: asset.highCount,
    environment: asset.environment,
    isProduction: asset.isProduction,
    complianceScope: asset.complianceScope,
    dataClassification: asset.dataClassification,
    lastRiskScoredAt: asset.lastRiskScoredAt?.toISOString() ?? null,
    findings: asset.scanResults.map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      description: r.description,
      cveId: r.cveId,
      cvssScore: r.cvssScore,
      status: r.status,
      remediation: r.remediation,
      scanId: r.scan?.id,
      scanName: r.scan?.name,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// ── PATCH: Update asset fields ──────────────────────────────────────
const ALLOWED_FIELDS = new Set([
  "name", "type", "ipAddress", "hostname", "os", "criticality", "status",
  "groupId", "macAddress", "manufacturer", "model", "firmware", "networkRole",
  "serialNumber", "biosUuid", "physicalLocation", "assetOwner", "subnet", "vlan",
  "installedSoftware", "userAccounts", "services", "openPorts",
]);

const JSON_FIELDS = new Set(["installedSoftware", "userAccounts", "services", "openPorts"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canEdit = await rbac.checkCapability(session.id, session.tenantId, "asset.edit");
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden: requires asset.edit capability" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  // Build update data from allowlisted fields only
  const updateData: Record<string, unknown> = {};
  const changedFields: string[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;

    if (JSON_FIELDS.has(key)) {
      // Validate JSON array fields
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) {
            return NextResponse.json(
              { error: `${key} must be a JSON array` },
              { status: 400 }
            );
          }
          updateData[key] = value;
        } catch {
          return NextResponse.json(
            { error: `${key} must be valid JSON` },
            { status: 400 }
          );
        }
      } else if (Array.isArray(value)) {
        updateData[key] = JSON.stringify(value);
      } else {
        return NextResponse.json(
          { error: `${key} must be a JSON array or stringified array` },
          { status: 400 }
        );
      }
    } else {
      updateData[key] = value ?? null;
    }
    changedFields.push(key);
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Verify asset exists and belongs to this tenant
  const existing = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const updated = await prisma.asset.update({
    where: { id },
    data: updateData,
    include: { group: true },
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "asset.updated",
    resourceType: "asset",
    resourceId: id,
    result: "success",
    details: { changedFields, updates: updateData },
    request,
  });

  return NextResponse.json(updated);
}

// ── DELETE: Remove asset ──────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canDelete = await rbac.checkCapability(session.id, session.tenantId, "asset.delete");
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden: requires asset.delete capability" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Delete related records first
  await prisma.assetTag.deleteMany({ where: { assetId: id } });
  await prisma.scanResult.deleteMany({ where: { assetId: id } });
  await prisma.asset.delete({ where: { id } });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "asset.deleted",
    resourceType: "asset",
    resourceId: id,
    result: "success",
    details: { name: existing.name, type: existing.type },
    request,
  });

  return NextResponse.json({ success: true });
}
