import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/sso/providers — Public endpoint.
 * Returns enabled SSO providers for the login page (no secrets exposed).
 */
export async function GET() {
  try {
    const providers = await prisma.sSOProvider.findMany({
      where: { isEnabled: true },
      select: {
        id: true,
        providerType: true,
        name: true,
      },
    });

    return NextResponse.json({ providers });
  } catch (error) {
    console.error("SSO providers list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
