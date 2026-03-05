import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearAllRateLimits } from "@/lib/rate-limit";

/**
 * Test-only endpoint: resets account lockout AND rate limits.
 * Only works in development mode.
 */
export async function POST(request: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const email = body.email as string;

    // Always clear ALL in-memory rate limits
    clearAllRateLimits();

    if (!email) {
      return NextResponse.json({ success: true, message: "Rate limits cleared" });
    }

    // Find the user to get tenantId (since email alone is not unique)
    const found = await prisma.user.findFirst({
      where: { email },
      select: { id: true, tenantId: true },
    });

    if (!found) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Reset lockout using the unique compound key
    const user = await prisma.user.update({
      where: { tenantId_email: { tenantId: found.tenantId, email } },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true, email: true, failedLoginAttempts: true, lockedUntil: true },
    });

    return NextResponse.json({ success: true, user, rateLimitsCleared: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reset lockout", details: String(error) },
      { status: 500 }
    );
  }
}
