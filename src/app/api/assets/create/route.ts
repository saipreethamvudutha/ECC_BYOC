import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "assets.inventory:create"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { name, type, ipAddress, hostname, os, criticality, groupId } = await request.json();

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
    },
    include: { group: true },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "asset.created",
      resourceType: "asset",
      resourceId: asset.id,
      result: "success",
      details: JSON.stringify({ name, type, ipAddress }),
    },
  });

  return NextResponse.json(asset);
}
