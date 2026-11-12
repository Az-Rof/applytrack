import { NextResponse } from "next/server";
import { getCurrentUser, publicUser } from "@/lib/auth";
import { fail } from "@/lib/api";

/** GET /api/auth/me — the currently logged-in user (by user id), or 401. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("Not logged in.", 401);
  return NextResponse.json({ user: publicUser(user) });
}
