import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  // Capture session BEFORE clearing cookies
  const session = await getSession();

  const response = NextResponse.json({ message: "Logged out" });

  response.cookies.set("byoc_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  response.cookies.set("byoc_refresh", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  // Audit log — fire after clearing cookies but before returning response
  if (session) {
    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "user.logout",
      resourceType: "user",
      resourceId: session.id,
      result: "success",
      details: { email: session.email },
      request,
    });
  }

  return response;
}
