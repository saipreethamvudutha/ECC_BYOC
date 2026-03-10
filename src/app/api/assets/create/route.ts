import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { applyAutoTagRules } from "@/lib/auto-tag";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "asset.create"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const {
    name, type, ipAddress, hostname, os, criticality, groupId,
    macAddress, manufacturer, model, firmware, networkRole,
    serialNumber, biosUuid, physicalLocation, assetOwner, subnet, vlan,
    installedSoftware, userAccounts,
  } = await request.json();

  if (!name || !type) {
    return NextResponse.json(
      { error: "Name and type are required" },
      { status: 400 }
    );
  }

  const asset = await prisma.asset.create({
    data: {
      tenantId: session.tenantId,
      name,
      type,
      ipAddress: ipAddress || null,
      hostname: hostname || null,
      os: os || null,
      criticality: criticality || "medium",
      groupId: groupId || null,
      macAddress: macAddress || null,
      manufacturer: manufacturer || null,
      model: model || null,
      firmware: firmware || null,
      networkRole: networkRole || null,
      serialNumber: serialNumber || null,
      biosUuid: biosUuid || null,
      physicalLocation: physicalLocation || null,
      assetOwner: assetOwner || null,
      subnet: subnet || null,
      vlan: vlan || null,
      installedSoftware: installedSoftware ? (typeof installedSoftware === "string" ? installedSoftware : JSON.stringify(installedSoftware)) : "[]",
      userAccounts: userAccounts ? (typeof userAccounts === "string" ? userAccounts : JSON.stringify(userAccounts)) : "[]",
    },
    include: { group: true },
  });

  // Apply auto-tag rules to the new asset
  const appliedTags = await applyAutoTagRules(session.tenantId, asset.id);

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "asset.created",
    resourceType: "asset",
    resourceId: asset.id,
    result: "success",
    details: { name, type, ipAddress, autoTagsApplied: appliedTags.length },
    request,
  });

  return NextResponse.json(asset);
}
