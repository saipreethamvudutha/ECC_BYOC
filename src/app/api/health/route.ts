import { NextResponse } from "next/server";

export async function GET() {
  const result: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  // Basic database connectivity check (no counts or sensitive data)
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    result.database = { connected: true };
  } catch {
    result.database = { connected: false };
    result.status = "error";
  }

  const statusCode = result.status === "error" ? 503 : 200;
  return NextResponse.json(result, { status: statusCode });
}
