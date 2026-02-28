import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";

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

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const result = await authenticateUser(email, password);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isProduction = process.env.NODE_ENV === "production";

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
