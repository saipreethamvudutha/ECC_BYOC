import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { Prisma } from "@prisma/client";
import { isValidUUID } from "@/lib/validation";

/**
 * GET /api/scopes/[id]/preview
 *
 * Preview which assets match this scope's tag filter.
 * Requires: admin.role.view capability.
 *
 * Returns: { totalAssets, matchingAssets, assets: [...] }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await rbac.checkPermission(
    session.id, session.tenantId, "admin.role.view"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const scope = await prisma.scope.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const totalAssets = await prisma.asset.count({
    where: { tenantId: session.tenantId },
  });

  // Global scope matches all assets
  if (scope.isGlobal) {
    const assets = await prisma.asset.findMany({
      where: { tenantId: session.tenantId },
      take: 50,
      orderBy: { name: "asc" },
      include: {
        assetTags: {
          include: {
            tag: { select: { id: true, key: true, value: true, color: true } },
          },
        },
      },
    });

    return NextResponse.json({
      totalAssets,
      matchingAssets: totalAssets,
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        criticality: a.criticality,
        tags: a.assetTags.map((at) => ({
          id: at.tag.id,
          key: at.tag.key,
          value: at.tag.value,
          color: at.tag.color,
        })),
      })),
    });
  }

  // Parse tag filter and build AND conditions
  let tagFilter: Record<string, string[]>;
  try {
    tagFilter = JSON.parse(scope.tagFilter);
  } catch {
    return NextResponse.json(
      { error: "Invalid tag filter JSON in scope" },
      { status: 500 }
    );
  }

  const filterKeys = Object.keys(tagFilter);

  if (filterKeys.length === 0) {
    return NextResponse.json({
      totalAssets,
      matchingAssets: 0,
      assets: [],
    });
  }

  // Build Prisma AND condition: for each key in filter,
  // asset must have at least one tag with that key and one of the allowed values
  const andConditions: Prisma.AssetWhereInput[] = filterKeys.map((key) => ({
    assetTags: {
      some: {
        tag: {
          tenantId: session.tenantId,
          key,
          value: { in: tagFilter[key] },
        },
      },
    },
  }));

  const matchingAssets = await prisma.asset.count({
    where: {
      tenantId: session.tenantId,
      AND: andConditions,
    },
  });

  const assets = await prisma.asset.findMany({
    where: {
      tenantId: session.tenantId,
      AND: andConditions,
    },
    take: 50,
    orderBy: { name: "asc" },
    include: {
      assetTags: {
        include: {
          tag: { select: { id: true, key: true, value: true, color: true } },
        },
      },
    },
  });

  return NextResponse.json({
    totalAssets,
    matchingAssets,
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      criticality: a.criticality,
      tags: a.assetTags.map((at) => ({
        id: at.tag.id,
        key: at.tag.key,
        value: at.tag.value,
        color: at.tag.color,
      })),
    })),
  });
}
