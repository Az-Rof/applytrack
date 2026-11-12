import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, publicUser, setSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { handleError, ok } from "@/lib/api";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().max(100).optional(),
});

/**
 * POST /api/auth/register  { email, password, name? }
 * Creates the account, logs it in (session cookie) and returns the user.
 * The user is identified by `id` from then on — the email is only the
 * login name. Open registration: for a shared/public deployment, gate this
 * route or remove it and create users directly in the database.
 */
export async function POST(request: Request) {
  try {
    const { email, password, name } = registerSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Log in instead." },
        { status: 409 },
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        name: name || null,
      },
    });

    const token = await createSession(user.id);
    return setSessionCookie(ok({ user: publicUser(user) }, { status: 201 }), token);
  } catch (err) {
    return handleError(err);
  }
}
