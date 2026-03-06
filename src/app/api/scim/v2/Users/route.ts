import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateSCIM, toSCIMUser, fromSCIMUser, buildListResponse, buildErrorResponse, parseSCIMFilter } from "@/lib/scim";
import { createAuditLog } from "@/lib/audit";

/**
 * GET /api/scim/v2/Users — List users (SCIM 2.0).
 * POST /api/scim/v2/Users — Create user (SCIM 2.0).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSCIM(request);
    if (!auth) {
      return NextResponse.json(buildErrorResponse(401, "Unauthorized"), { status: 401 });
    }

    const startIndex = parseInt(request.nextUrl.searchParams.get("startIndex") || "1");
    const count = Math.min(parseInt(request.nextUrl.searchParams.get("count") || "100"), 100);
    const filter = request.nextUrl.searchParams.get("filter");

    // Build where clause
    const where: Record<string, unknown> = { tenantId: auth.tenantId };

    if (filter) {
      const parsed = parseSCIMFilter(filter);
      if (parsed) {
        if (parsed.field === "username" || parsed.field === "emails.value") {
          if (parsed.operator === "eq") where.email = parsed.value;
          else if (parsed.operator === "co") where.email = { contains: parsed.value };
        } else if (parsed.field === "active") {
          where.status = parsed.value === "true" ? "active" : "suspended";
        } else if (parsed.field === "externalid") {
          where.authProviderId = parsed.value;
        }
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: startIndex - 1,
        take: count,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://byoc-rosy.vercel.app";
    const resources = users.map(u => toSCIMUser(u, appUrl));

    return NextResponse.json(buildListResponse(resources, total, startIndex));
  } catch (error) {
    console.error("SCIM Users GET error:", error);
    return NextResponse.json(buildErrorResponse(500, "Internal server error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSCIM(request);
    if (!auth) {
      return NextResponse.json(buildErrorResponse(401, "Unauthorized"), { status: 401 });
    }

    const scimData = await request.json();
    const userData = fromSCIMUser(scimData);

    if (!userData.email) {
      return NextResponse.json(buildErrorResponse(400, "userName (email) is required"), { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findFirst({
      where: { tenantId: auth.tenantId, email: userData.email },
    });

    if (existing) {
      return NextResponse.json(
        buildErrorResponse(409, "User already exists", "uniqueness"),
        { status: 409 }
      );
    }

    // Find viewer role as default
    const viewerRole = await prisma.role.findFirst({
      where: { tenantId: auth.tenantId, slug: "viewer" },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: auth.tenantId,
        email: userData.email,
        name: userData.name,
        phone: userData.phone,
        avatarUrl: userData.avatarUrl,
        authProvider: "scim",
        authProviderId: userData.authProviderId,
        status: userData.status,
        ...(viewerRole
          ? { userRoles: { create: { roleId: viewerRole.id } } }
          : {}),
      },
    });

    await createAuditLog({
      tenantId: auth.tenantId,
      actorType: "system",
      action: "scim.user.created",
      result: "success",
      resourceType: "user",
      resourceId: user.id,
      details: { email: user.email, scimTokenId: auth.tokenId },
      request,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://byoc-rosy.vercel.app";
    return NextResponse.json(toSCIMUser(user, appUrl), { status: 201 });
  } catch (error) {
    console.error("SCIM Users POST error:", error);
    return NextResponse.json(buildErrorResponse(500, "Internal server error"), { status: 500 });
  }
}
