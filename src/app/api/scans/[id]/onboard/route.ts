import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Onboarding assets requires asset.create capability
  const canCreate = await rbac.checkCapability(
    session.id, session.tenantId, "asset.create"
  );
  if (!canCreate) {
    return NextResponse.json({ error: "Forbidden: requires asset.create capability" }, { status: 403 });
  }

  const { id } = await params;

  // Verify scan belongs to tenant
  const scan = await prisma.scan.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true, completedAt: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const { assetIds } = await request.json();

  if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
    return NextResponse.json(
      { error: "assetIds array is required" },
      { status: 400 }
    );
  }

  // Find matching discovered assets belonging to this tenant
  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      tenantId: session.tenantId,
      status: "discovered",
    },
    select: { id: true, name: true, ipAddress: true },
  });

  if (assets.length === 0) {
    return NextResponse.json(
      { error: "No discovered assets found matching the provided IDs" },
      { status: 400 }
    );
  }

  // Flip all matching assets from "discovered" → "active"
  await prisma.asset.updateMany({
    where: {
      id: { in: assets.map((a) => a.id) },
      tenantId: session.tenantId,
      status: "discovered",
    },
    data: {
      status: "active",
      discoveryMethod: "scanner",
      discoveredAt: scan.completedAt || new Date(),
    },
  });

  // Create audit log for each onboarded asset
  for (const asset of assets) {
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "asset.onboarded",
      resourceType: "asset",
      resourceId: asset.id,
      result: "success",
      details: {
        assetName: asset.name,
        ipAddress: asset.ipAddress,
        scanId: scan.id,
        scanName: scan.name,
      },
      request,
    });
  }

  return NextResponse.json({
    onboarded: assets.length,
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      ipAddress: a.ipAddress,
      status: "active",
    })),
  });
}
