import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assets = await prisma.asset.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      group: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      ipAddress: a.ipAddress,
      hostname: a.hostname,
      os: a.os,
      criticality: a.criticality,
      status: a.status,
      tags: JSON.parse(a.tags),
      group: a.group ? { id: a.group.id, name: a.group.name } : null,
      lastScanAt: a.lastScanAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
    }))
  );
}
