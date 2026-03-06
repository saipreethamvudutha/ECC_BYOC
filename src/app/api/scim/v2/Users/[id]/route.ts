import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateSCIM, toSCIMUser, buildErrorResponse, SCIM_SCHEMAS } from "@/lib/scim";
import { createAuditLog } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/scim/v2/Users/[id] — Get single user.
 * PATCH /api/scim/v2/Users/[id] — Update user (SCIM PatchOp).
 * DELETE /api/scim/v2/Users/[id] — Deactivate user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateSCIM(request);
    if (!auth) return NextResponse.json(buildErrorResponse(401, "Unauthorized"), { status: 401 });

    const { id } = await params;
    const user = await prisma.user.findFirst({
      where: { id, tenantId: auth.tenantId },
    });

    if (!user) {
      return NextResponse.json(buildErrorResponse(404, "User not found"), { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://byoc-rosy.vercel.app";
    return NextResponse.json(toSCIMUser(user, appUrl));
  } catch (error) {
    console.error("SCIM User GET error:", error);
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
    const user = await prisma.user.findFirst({
      where: { id, tenantId: auth.tenantId },
    });

    if (!user) {
      return NextResponse.json(buildErrorResponse(404, "User not found"), { status: 404 });
    }

    const body = await request.json();
    const operations = body.Operations || [];
    const updateData: Record<string, any> = {};

    for (const op of operations) {
      if (op.op === "replace") {
        if (op.path === "active") {
          updateData.status = op.value === true || op.value === "true" ? "active" : "suspended";
        } else if (op.path === "name.givenName" || op.path === "name.familyName") {
          // Handle name updates
          const currentParts = (user.name || "").split(" ");
          if (op.path === "name.givenName") {
            updateData.name = `${op.value} ${currentParts.slice(1).join(" ")}`.trim();
          } else {
            updateData.name = `${currentParts[0] || ""} ${op.value}`.trim();
          }
        } else if (op.path === "userName" || op.path === "emails[type eq \"work\"].value") {
          updateData.email = op.value;
        } else if (op.path === "phoneNumbers[type eq \"work\"].value") {
          updateData.phone = op.value;
        } else if (op.path === "externalId") {
          updateData.authProviderId = op.value;
        } else if (!op.path) {
          // Bulk replace (no path = replace entire resource attributes)
          if (op.value?.active !== undefined) {
            updateData.status = op.value.active ? "active" : "suspended";
          }
          if (op.value?.name) {
            const name = `${op.value.name.givenName || ""} ${op.value.name.familyName || ""}`.trim();
            if (name) updateData.name = name;
          }
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({ where: { id }, data: updateData });
    }

    await createAuditLog({
      tenantId: auth.tenantId,
      actorType: "system",
      action: "scim.user.updated",
      result: "success",
      resourceType: "user",
      resourceId: id,
      details: { fields: Object.keys(updateData), scimTokenId: auth.tokenId },
      request,
    });

    const updated = await prisma.user.findUnique({ where: { id } });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://byoc-rosy.vercel.app";
    return NextResponse.json(toSCIMUser(updated!, appUrl));
  } catch (error) {
    console.error("SCIM User PATCH error:", error);
    return NextResponse.json(buildErrorResponse(500, "Internal server error"), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateSCIM(request);
    if (!auth) return NextResponse.json(buildErrorResponse(401, "Unauthorized"), { status: 401 });

    const { id } = await params;
    const user = await prisma.user.findFirst({
      where: { id, tenantId: auth.tenantId },
    });

    if (!user) {
      return NextResponse.json(buildErrorResponse(404, "User not found"), { status: 404 });
    }

    // Soft delete: set status to suspended (SCIM standard is soft delete)
    await prisma.user.update({
      where: { id },
      data: { status: "suspended" },
    });

    await createAuditLog({
      tenantId: auth.tenantId,
      actorType: "system",
      action: "scim.user.deactivated",
      result: "success",
      resourceType: "user",
      resourceId: id,
      details: { email: user.email, scimTokenId: auth.tokenId },
      request,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("SCIM User DELETE error:", error);
    return NextResponse.json(buildErrorResponse(500, "Internal server error"), { status: 500 });
  }
}
