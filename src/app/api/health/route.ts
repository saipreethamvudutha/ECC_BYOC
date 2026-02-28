import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      NODE_ENV: process.env.NODE_ENV || "not set",
    },
  };

  // Test database connection
  try {
    const { prisma } = await import("@/lib/prisma");
    const count = await prisma.tenant.count();
    (checks as Record<string, unknown>).database = { connected: true, tenants: count };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    (checks as Record<string, unknown>).database = { connected: false, error: message };
    checks.status = "degraded";
  }

  return NextResponse.json(checks);
}
