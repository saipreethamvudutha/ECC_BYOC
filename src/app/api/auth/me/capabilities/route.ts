import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";

/**
 * GET /api/auth/me/capabilities
 *
 * Returns the current user's effective capability profile.
 * Used by the frontend to initialize the permission system.
 *
 * Response:
 * {
 *   capabilities: string[],   // granted capability IDs
 *   denied: string[],         // explicitly denied capability IDs
 *   roles: string[],          // role slugs
 *   globalScope: boolean      // true if user has unrestricted data access
 * }
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await rbac.getProfile(session.id, session.tenantId);

  return NextResponse.json(profile);
}
