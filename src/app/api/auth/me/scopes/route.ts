import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/me/scopes
 *
 * Return the current user's effective scopes.
 * Admin roles (platform-admin, org-admin) get globalScope: true.
 * Other users get their assigned scopes from the UserScope table.
 *
 * Response: { globalScope: boolean, scopes: [...] }
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin roles get implicit global scope
  const adminSlugs = ["platform-admin", "org-admin"];
  if (session.roles.some((r) => adminSlugs.includes(r))) {
    return NextResponse.json({
      globalScope: true,
      scopes: [],
    });
  }

  // Load user's assigned scopes
  const userScopes = await prisma.userScope.findMany({
    where: { userId: session.id },
    include: {
      scope: true,
    },
  });

  let globalScope = false;
  const scopes = userScopes.map((us) => {
    if (us.scope.isGlobal) {
      globalScope = true;
    }

    let tagFilter: Record<string, string[]> = {};
    try {
      tagFilter = JSON.parse(us.scope.tagFilter);
    } catch {
      // Skip invalid JSON
    }

    return {
      id: us.scope.id,
      name: us.scope.name,
      description: us.scope.description,
      tagFilter,
      isGlobal: us.scope.isGlobal,
    };
  });

  return NextResponse.json({
    globalScope,
    scopes,
  });
}
