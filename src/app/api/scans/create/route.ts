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

  const requestBody = await request.json();
  const { name, type, targets } = requestBody;

  if (!name || !type || !targets?.length) {
    return NextResponse.json(
      { error: "Name, type, and targets are required" },
      { status: 400 }
    );
  }

  const validTypes = ["vulnerability", "port", "compliance", "full", "discovery", "enterprise", "authenticated"];
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

  // Create target credential mappings for authenticated scans
  if (type === 'authenticated' && Array.isArray(requestBody.targetCredentials) && requestBody.targetCredentials.length > 0) {
    const targetCredentials = requestBody.targetCredentials as Array<{ target: string; credentialId: string }>;

    // Validate all credentialIds belong to this tenant
    const credentialIds = [...new Set(targetCredentials.map((tc: { credentialId: string }) => tc.credentialId))];
    const validCredentials = await prisma.credentialVault.findMany({
      where: { id: { in: credentialIds }, tenantId: session.tenantId },
      select: { id: true },
    });
    const validIds = new Set(validCredentials.map((c: { id: string }) => c.id));

    const invalidCreds = credentialIds.filter((id: string) => !validIds.has(id));
    if (invalidCreds.length > 0) {
      // Delete the scan we just created and return error
      await prisma.scan.delete({ where: { id: scan.id } });
      return NextResponse.json({ error: `Invalid credentialId(s): ${invalidCreds.join(', ')}` }, { status: 400 });
    }

    await prisma.scanTargetCredential.createMany({
      data: targetCredentials.map((tc: { target: string; credentialId: string }) => ({
        tenantId: session.tenantId,
        scanId: scan.id,
        target: tc.target,
        credentialId: tc.credentialId,
      })),
      skipDuplicates: true,
    });
  }

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
      // Create as "discovered" — user selects which to onboard after scan
      await prisma.asset.create({
        data: {
          tenantId: session.tenantId,
          name: host,
          type: isIp ? "server" : "application",
          ipAddress: isIp ? host : null,
          hostname: isIp ? null : host,
          criticality: "medium",
          status: "discovered",
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
