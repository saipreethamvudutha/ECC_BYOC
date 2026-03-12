import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { initializeProgress } from "@/lib/scanner";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkCapability(
    session.id, session.tenantId, "scan.create"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { name, type, targets } = await request.json();

  if (!name || !type || !targets?.length) {
    return NextResponse.json(
      { error: "Name, type, and targets are required" },
      { status: 400 }
    );
  }

  const validTypes = ["vulnerability", "port", "compliance", "full", "discovery", "enterprise"];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid scan type. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  try {
  // Initialize scan progress based on type (async — detects nmap availability)
  const progress = await initializeProgress(type);

  const scan = await prisma.scan.create({
    data: {
      tenantId: session.tenantId,
      name,
      type,
      status: "queued",
      targets: JSON.stringify(targets),
      progress: JSON.stringify(progress),
      createdById: session.id,
    },
  });

  // Auto-create Asset records for targets that don't exist
  for (const target of targets) {
    const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);

    const existing = await prisma.asset.findFirst({
      where: {
        tenantId: session.tenantId,
        OR: [
          { ipAddress: host },
          { hostname: host },
          { name: host },
        ],
      },
    });

    if (!existing) {
      await prisma.asset.create({
        data: {
          tenantId: session.tenantId,
          name: host,
          type: isIp ? "server" : "application",
          ipAddress: isIp ? host : null,
          hostname: isIp ? null : host,
          criticality: "medium",
          status: "active",
        },
      });
    }
  }

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "scan.created",
    resourceType: "scan",
    resourceId: scan.id,
    result: "success",
    details: { name, type, targets },
    request,
  });

  return NextResponse.json({
    id: scan.id,
    name: scan.name,
    type: scan.type,
    status: scan.status,
    progress,
    message: "Scan created and queued. Call /api/scans/{id}/execute to start.",
  });
  } catch (error) {
    console.error("Scan create error:", error);
    return NextResponse.json(
      { error: "Failed to create scan", details: String(error) },
      { status: 500 }
    );
  }
}
