import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await prisma.report.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    reports.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))
  );
}
