import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, publicUser, setSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** CORS for the extension popup/options page (chrome-extension:// origin). */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/auth/login  { email, password }
 * Returns `{ user, token }` and sets the session cookie. The extension uses
 * the returned `token` (sent as `X-ApplyTrack-Session`); the browser uses
 * the cookie. Same error for unknown email / wrong password / account
 * without a password, so an attacker cannot enumerate accounts.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = loginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({ where: { email } });
    const valid =
      user?.passwordHash != null &&
      (await verifyPassword(password, user.passwordHash));
    if (!user || !valid) {
      return fail("Invalid email or password.", 401);
    }

    const token = await createSession(user.id);
    const response = setSessionCookie(
      ok({ user: publicUser(user), token }, { status: 200, headers: CORS_HEADERS }),
      token,
    );
    return response;
  } catch (err) {
    return handleError(err);
  }
}
