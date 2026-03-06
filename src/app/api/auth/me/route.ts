import { NextResponse } from "next/server";
import { getSession, getCurrentUserPermissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getCurrentUserPermissions();

  // Fetch MFA status from database
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { mfaEnabled: true },
  });

  return NextResponse.json({
    user: {
      ...session,
      mfaEnabled: user?.mfaEnabled || false,
    },
    permissions,
  });
}
