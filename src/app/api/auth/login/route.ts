import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { checkRateLimit, LOGIN_RATE_LIMIT } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Check required env vars early
    if (!process.env.DATABASE_URL) {
      console.error("Login error: DATABASE_URL is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }
    if (!process.env.AUTH_SECRET) {
      console.error("Login error: AUTH_SECRET is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // H3: Per-IP rate limiting
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const rateCheck = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSeconds || 60),
            "X-RateLimit-Limit": String(LOGIN_RATE_LIMIT.maxRequests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateCheck.resetAt / 1000)),
          },
        }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await authenticateUser(email, password, request);
    } catch (authError) {
      const errMsg = authError instanceof Error ? authError.message : "";
      if (errMsg.startsWith("ACCOUNT_LOCKED:")) {
        const remaining = parseInt(errMsg.split(":")[1]) || 900;
        const minutes = Math.ceil(remaining / 60);
        return NextResponse.json(
          { error: `Account is locked due to too many failed attempts. Please try again in ${minutes} minute${minutes > 1 ? "s" : ""}.` },
          { status: 423 }
        );
      }
      throw authError;
    }

    if (!result) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isProduction = process.env.NODE_ENV === "production";

    // Handle MFA-pending response
    if (result.mfaRequired) {
      const mfaResponse = NextResponse.json({
        mfaRequired: true,
        message: "MFA verification required",
      });

      // Set temporary MFA cookie (5 min, same as MFA pending token TTL)
      mfaResponse.cookies.set("byoc_mfa", result.mfaPendingToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 5 * 60,
        path: "/",
      });

      return mfaResponse;
    }

    // Normal login (no MFA)
    const response = NextResponse.json({
      user: result.user,
      message: "Login successful",
    });

    response.cookies.set("byoc_token", result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 15 * 60,
      path: "/",
    });

    response.cookies.set("byoc_refresh", result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Login error:", message, error);
    return NextResponse.json(
      { error: "Internal server error", detail: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
