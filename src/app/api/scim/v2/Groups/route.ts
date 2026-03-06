import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateSCIM, toSCIMGroup, buildListResponse, buildErrorResponse } from "@/lib/scim";

/**
 * GET /api/scim/v2/Groups — List roles as SCIM groups.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSCIM(request);
    if (!auth) return NextResponse.json(buildErrorResponse(401, "Unauthorized"), { status: 401 });

    const startIndex = parseInt(request.nextUrl.searchParams.get("startIndex") || "1");
    const count = Math.min(parseInt(request.nextUrl.searchParams.get("count") || "100"), 100);

    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        where: { tenantId: auth.tenantId, isActive: true },
        include: {
          userRoles: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
        skip: startIndex - 1,
        take: count,
      }),
      prisma.role.count({ where: { tenantId: auth.tenantId, isActive: true } }),
    ]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://byoc-rosy.vercel.app";
    const resources = roles.map(r =>
      toSCIMGroup(r, r.userRoles.map(ur => ({ id: ur.user.id, name: ur.user.name })), appUrl)
    );

    return NextResponse.json(buildListResponse(resources, total, startIndex));
  } catch (error) {
    console.error("SCIM Groups GET error:", error);
    return NextResponse.json(buildErrorResponse(500, "Internal server error"), { status: 500 });
  }
}
