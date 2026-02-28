import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, unknown> = {
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
    const tenantCount = await prisma.tenant.count();
    const userCount = await prisma.user.count();
    checks.database = { connected: true, tenants: tenantCount, users: userCount };

    if (tenantCount === 0 || userCount === 0) {
      checks.status = "degraded";
      checks.warning = "Database is empty. Run: npx prisma db push && npx tsx prisma/seed.ts";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    checks.database = { connected: false, error: message };
    checks.status = "error";
  }

  if (!process.env.DATABASE_URL) {
    checks.status = "error";
    checks.missingEnv = checks.missingEnv || [];
    (checks.missingEnv as string[]).push("DATABASE_URL");
  }
  if (!process.env.AUTH_SECRET) {
    checks.status = "error";
    checks.missingEnv = checks.missingEnv || [];
    (checks.missingEnv as string[]).push("AUTH_SECRET");
  }

  const statusCode = checks.status === "error" ? 503 : 200;
  return NextResponse.json(checks, { status: statusCode });
}
