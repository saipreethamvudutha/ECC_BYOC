import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateSCIM, toSCIMGroup, buildErrorResponse } from "@/lib/scim";
import { createAuditLog } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/scim/v2/Groups/[id] — Get role as SCIM group.
 * PATCH /api/scim/v2/Groups/[id] — Add/remove members from role.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateSCIM(request);
    if (!auth) return NextResponse.json(buildErrorResponse(401, "Unauthorized"), { status: 401 });

    const { id } = await params;
    const role = await prisma.role.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: {
        userRoles: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!role) {
      return NextResponse.json(buildErrorResponse(404, "Group not found"), { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://byoc-rosy.vercel.app";
    const members = role.userRoles.map(ur => ({ id: ur.user.id, name: ur.user.name }));
    return NextResponse.json(toSCIMGroup(role, members, appUrl));
  } catch (error) {
    console.error("SCIM Group GET error:", error);
    return NextResponse.json(buildErrorResponse(500, "Internal server error"), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateSCIM(request);
    if (!auth) return NextResponse.json(buildErrorResponse(401, "Unauthorized"), { status: 401 });

    const { id } = await params;
    const role = await prisma.role.findFirst({
      where: { id, tenantId: auth.tenantId },
    });

    if (!role) {
      return NextResponse.json(buildErrorResponse(404, "Group not found"), { status: 404 });
    }

    const body = await request.json();
    const operations = body.Operations || [];

    for (const op of operations) {
      if (op.path === "members") {
        if (op.op === "add" && Array.isArray(op.value)) {
          // Add members (assign role)
          for (const member of op.value) {
            const userId = member.value;
            const user = await prisma.user.findFirst({
              where: { id: userId, tenantId: auth.tenantId },
            });
            if (!user) continue;

            await prisma.userRole.upsert({
              where: { userId_roleId: { userId, roleId: id } },
              update: {},
              create: { userId, roleId: id },
            });
          }
        } else if (op.op === "remove" && Array.isArray(op.value)) {
          // Remove members (unassign role)
          for (const member of op.value) {
            await prisma.userRole.deleteMany({
              where: { userId: member.value, roleId: id },
            });
          }
        }
      }
    }

    await createAuditLog({
      tenantId: auth.tenantId,
      actorType: "system",
      action: "scim.group.updated",
      result: "success",
      resourceType: "role",
      resourceId: id,
      details: { operationCount: operations.length, scimTokenId: auth.tokenId },
      request,
    });

    // Return updated group
    const updated = await prisma.role.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://byoc-rosy.vercel.app";
    const members = updated!.userRoles.map(ur => ({ id: ur.user.id, name: ur.user.name }));
    return NextResponse.json(toSCIMGroup(updated!, members, appUrl));
  } catch (error) {
    console.error("SCIM Group PATCH error:", error);
    return NextResponse.json(buildErrorResponse(500, "Internal server error"), { status: 500 });
  }
}
