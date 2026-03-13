import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

const safeParse = (str: string) => { try { return JSON.parse(str); } catch { return {}; } };

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check asset.view capability before loading any data
  const hasAssetView = await rbac.checkCapability(session.id, session.tenantId, "asset.view");
  if (!hasAssetView) {
    return NextResponse.json(
      { error: "Forbidden: requires asset.view capability" },
      { status: 403 }
    );
  }

  // Load user's RBAC profile for scope filtering
  const profile = await rbac.loadProfile(session.id, session.tenantId);

  // Status filter — hide "discovered" assets by default (only show managed)
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");

  // Build WHERE clause with scope-based filtering
  const where: Prisma.AssetWhereInput = { tenantId: session.tenantId };

  if (statusParam === "all") {
    // Show everything including discovered
  } else if (statusParam === "discovered") {
    where.status = "discovered";
  } else if (statusParam) {
    where.status = statusParam;
  } else {
    // Default: exclude discovered assets from inventory view
    where.status = { not: "discovered" };
  }

  if (!profile.globalScope) {
    if (profile.tagFilters.length === 0) {
      // No scopes assigned = no access to any assets
      return NextResponse.json([]);
    }

    // Build OR conditions from user's scope tag filters
    // Each scope filter: {"env": ["production"], "region": ["mumbai"]}
    // Keys are ANDed, values within a key are ORed, scopes are UNIONed
    const scopeConditions: Prisma.AssetWhereInput[] = profile.tagFilters.map(
      (filter) => {
        const andConditions: Prisma.AssetWhereInput[] = Object.entries(filter).map(
          ([key, values]) => ({
            assetTags: {
              some: {
                tag: { key, value: { in: values } },
              },
            },
          })
        );
        return { AND: andConditions };
      }
    );

    where.OR = scopeConditions;
  }

  const assets = await prisma.asset.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      group: { select: { id: true, name: true } },
      assetTags: {
        include: {
          tag: { select: { id: true, key: true, value: true, color: true } },
        },
      },
    },
  });

  return NextResponse.json(
    assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      ipAddress: a.ipAddress,
      hostname: a.hostname,
      os: a.os,
      criticality: a.criticality,
      status: a.status,
      tags: safeParse(a.tags),
      assetTags: a.assetTags.map((at) => ({
        id: at.tag.id,
        key: at.tag.key,
        value: at.tag.value,
        color: at.tag.color,
      })),
      group: a.group ? { id: a.group.id, name: a.group.name } : null,
      assetOwner: a.assetOwner,
      lastScanAt: a.lastScanAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
    }))
  );
}
