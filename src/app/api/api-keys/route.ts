import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKeys = await prisma.apiKey.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      role: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(
    apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      role: k.role.name,
      createdBy: k.createdBy.name,
      rateLimit: k.rateLimit,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      expiresAt: k.expiresAt.toISOString(),
      createdAt: k.createdAt.toISOString(),
    }))
  );
}
