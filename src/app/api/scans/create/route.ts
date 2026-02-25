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
    session.id, session.tenantId, "scans.jobs:create"
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

  const scan = await prisma.scan.create({
    data: {
      tenantId: session.tenantId,
      name,
      type,
      status: "queued",
      targets: JSON.stringify(targets),
      createdById: session.id,
    },
  });

  // Simulate scan execution (mark as running then complete after a delay)
  setTimeout(async () => {
    try {
      await prisma.scan.update({
        where: { id: scan.id },
        data: { status: "running", startedAt: new Date() },
      });

      // Simulate scan completing after 5 seconds
      setTimeout(async () => {
        try {
          // Generate some mock findings
          const severities = ["critical", "high", "medium", "low", "info"];
          const findings = [];
          const numFindings = Math.floor(Math.random() * 8) + 2;

          for (let i = 0; i < numFindings; i++) {
            const severity = severities[Math.floor(Math.random() * severities.length)];
            findings.push({
              tenantId: session.tenantId,
              scanId: scan.id,
              severity,
              title: `Finding ${i + 1}: ${severity.toUpperCase()} level issue detected`,
              cvssScore: severity === "critical" ? 9.0 + Math.random()
                : severity === "high" ? 7.0 + Math.random() * 2
                : severity === "medium" ? 4.0 + Math.random() * 3
                : severity === "low" ? 1.0 + Math.random() * 3
                : 0,
            });
          }

          await prisma.scanResult.createMany({ data: findings });
          await prisma.scan.update({
            where: { id: scan.id },
            data: { status: "completed", completedAt: new Date() },
          });
        } catch (e) {
          console.error("Scan completion error:", e);
        }
      }, 5000);
    } catch (e) {
      console.error("Scan start error:", e);
    }
  }, 2000);

  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "scan.created",
      resourceType: "scan",
      resourceId: scan.id,
      result: "success",
      details: JSON.stringify({ name, type, targets }),
    },
  });

  return NextResponse.json({
    id: scan.id,
    name: scan.name,
    type: scan.type,
    status: scan.status,
    message: "Scan created and queued",
  });
}
