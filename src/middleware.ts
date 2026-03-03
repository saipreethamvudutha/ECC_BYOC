import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/register", "/accept-invitation", "/api/auth/login", "/api/auth/accept-invitation"];

// M12: Paths exempt from CSRF check (form-based or public endpoints)
const csrfExemptPaths = ["/api/auth/login", "/api/auth/accept-invitation", "/api/health"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // M12: CSRF protection for state-changing API requests
  // Validates Origin/Referer header matches the app's host to prevent cross-site request forgery
  if (
    pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    !csrfExemptPaths.some((p) => pathname.startsWith(p))
  ) {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const host = request.headers.get("host");

    if (host) {
      const originHost = origin ? new URL(origin).host : null;
      const refererHost = referer ? new URL(referer).host : null;

      // If neither Origin nor Referer matches the host, block the request
      // (Allows requests with no Origin/Referer — e.g., from API clients/curl)
      if (
        (origin && originHost !== host) ||
        (!origin && referer && refererHost !== host)
      ) {
        return NextResponse.json(
          { error: "Forbidden: cross-origin request blocked" },
          { status: 403 }
        );
      }
    }
  }

  // Allow API routes to handle their own auth
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get("byoc_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
