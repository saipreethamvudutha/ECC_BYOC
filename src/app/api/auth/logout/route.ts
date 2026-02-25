import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("byoc_token");
  cookieStore.delete("byoc_refresh");

  return NextResponse.json({ message: "Logged out" });
}
