import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-safe middleware: NO Prisma imports (Edge runtime cannot run the
 * Prisma engine — importing it here causes HTTP 500 on every request).
 * It only checks that a login session cookie exists; the cookie is
 * validated against the Session table by the pages/API routes themselves.
 */
const SESSION_COOKIE = "applytrack_session";

export function middleware(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  // Preserve the destination (used by the login page after success).
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(
    request.nextUrl.pathname + request.nextUrl.search,
  )}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API routes, static assets and the login page itself.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
