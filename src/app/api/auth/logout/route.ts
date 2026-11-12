import { cookies } from "next/headers";
import {
  clearSessionCookie,
  deleteSession,
  SESSION_COOKIE,
  SESSION_HEADER,
} from "@/lib/auth";
import { ok } from "@/lib/api";

/**
 * DELETE /api/auth/logout — deletes the session row and clears the cookie.
 * The session token comes from the cookie (browser) or the
 * `X-ApplyTrack-Session` header (extension).
 */
export async function DELETE(request: Request) {
  const store = await cookies();
  const token =
    request.headers.get(SESSION_HEADER) ?? store.get(SESSION_COOKIE)?.value;
  await deleteSession(token);
  return clearSessionCookie(ok({ ok: true }));
}
