import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Auth strategy: email + password, identified by the user `id`.
 *
 * - A user registers / logs in with email + password (`/api/auth/*`).
 * - Login creates a row in `Session` and sets an httpOnly cookie holding
 *   the raw token. Only the token's SHA-256 hash is stored in the DB.
 * - The extension logs in the same way (popup form) and sends the token
 *   as `X-ApplyTrack-Session` on every request — no cookies involved.
 * - Logging out deletes the session row (server-side logout, not just
 *   clearing a cookie).
 * - The old workspace-code auth (`/api/workspace`, `applytrack_code`
 *   cookie, `X-ApplyTrack-Workspace`) was removed on 12 Nov 2026.
 */
export const SESSION_COOKIE = "applytrack_session";
export const SESSION_HEADER = "x-applytrack-session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a session row and return the raw token (show it once). */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
    },
  });
  return token;
}

/** Resolve a raw session token to its user (null when unknown/expired). */
export async function getUserBySessionToken(token: string | null | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    // Lazy cleanup of the expired row.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

/** Delete one session (by raw token) — used by logout. */
export async function deleteSession(token: string | null | undefined) {
  if (!token) return;
  await prisma.session
    .delete({ where: { tokenHash: hashToken(token) } })
    .catch(() => undefined);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return getUserBySessionToken(token);
}

/**
 * Resolves the user for an API request.
 * Order: `X-ApplyTrack-Session` header (extension) → session cookie.
 * Nothing here falls back to a demo user — an unauthenticated request is
 * simply unauthenticated (401), even in development.
 */
export async function getUserForRequest(request: Request) {
  const headerToken = request.headers.get(SESSION_HEADER);
  if (headerToken) return getUserBySessionToken(headerToken);

  return getCurrentUser();
}

/**
 * Shared check for extension-called endpoints: `Authorization: Bearer <key>`
 * must match `EXTENSION_API_KEY` when provided. In development a mismatch is
 * only logged; in production it is a hard 401/500 (identical to capture).
 */
export function extensionApiKeyError(
  request: Request,
  headers?: Record<string, string>,
): NextResponse | null {
  const expectedKey = process.env.EXTENSION_API_KEY;
  const requireKey = process.env.NODE_ENV === "production";

  if (expectedKey) {
    const provided = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (provided !== expectedKey) {
      if (requireKey) {
        return NextResponse.json(
          { error: "Unauthorized", hint: "Check EXTENSION_API_KEY in the extension settings." },
          { status: 401, headers },
        );
      }
      console.warn(
        "[extension-auth] EXTENSION_API_KEY mismatch — allowed in development only.",
      );
    }
  } else if (requireKey) {
    return NextResponse.json(
      { error: "EXTENSION_API_KEY is not configured on the server" },
      { status: 500, headers },
    );
  }
  return null;
}

/** Set the session cookie on a response (used by /api/auth/login|register). */
export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

/** Clear the session cookie on a response (used by /api/auth/logout). */
export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

/** Server components: redirects to /login when there is no session. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Public shape of a user returned by the auth endpoints. */
export function publicUser(user: { id: string; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name };
}
