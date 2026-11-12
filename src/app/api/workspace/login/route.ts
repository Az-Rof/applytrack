import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByCode } from "@/lib/workspace";
import { DEMO_WORKSPACE_CODE, ensureDemoUser, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";

const loginSchema = z.object({ code: z.string().trim().min(3).max(64) });

/**
 * POST /api/workspace/login  { code: "XXXX" }
 * Sets the workspace session cookie. `DEMO` logs into the seeded sample data.
 */
export async function POST(request: Request) {
  try {
    const { code } = loginSchema.parse(await request.json());

    if (code.toUpperCase() === DEMO_WORKSPACE_CODE) {
      await ensureDemoUser();
    }

    const user = await findUserByCode(code);
    if (!user) {
      return fail("Workspace code not found. Check it, or create a new workspace.", 404);
    }

    const response = ok({ code: user.code, name: user.name });
    response.cookies.set(SESSION_COOKIE, user.code ?? "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (err) {
    return handleError(err);
  }
}

/** Log out. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
