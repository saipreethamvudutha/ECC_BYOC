import { NextResponse } from "next/server";
import { getSession, getCurrentUserPermissions } from "@/lib/auth";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getCurrentUserPermissions();

  return NextResponse.json({
    user: session,
    permissions,
  });
}
