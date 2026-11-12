import { NextResponse } from "next/server";
import { getUserForRequest } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  checkPlatformSession,
  PLATFORM_ORIGINS,
  type PlatformSession,
} from "@/lib/import/fetch-platform";

const PLATFORM = "JobStreet" as const;
const ORIGIN = PLATFORM_ORIGINS.JobStreet;

/** Masked connection info — the raw cookie is never returned to any client. */
export async function GET(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Unknown workspace", 401);

    const connection = await prisma.platformConnection.findUnique({
      where: { userId_platform: { userId: user.id, platform: PLATFORM } },
    });
    if (!connection) return NextResponse.json({ connected: false });

    return NextResponse.json({
      connected: true,
      isValid: connection.isValid,
      lastError: connection.lastError,
      lastCheckedAt: connection.lastCheckedAt?.toISOString() ?? null,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      updatedAt: connection.updatedAt.toISOString(),
      cookiePreview: maskCookie(connection.credentials),
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/sync/jobstreet/connection
 * Body: { cookie } — paste the Cookie header of any jobstreet.com request.
 * The cookie is validated with a cheap authenticated request before saving
 * (never persisted when it cannot be verified).
 */
export async function POST(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Unknown workspace", 401, "Log in first.");

    let body: { cookie?: unknown; userAgent?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return fail("Send JSON: { cookie }.", 400);
    }

    if (typeof body.cookie !== "string" || !body.cookie.trim()) {
      return fail("Provide `cookie` (the Cookie header of a jobstreet.com request).", 400);
    }

    const session: PlatformSession = {
      platform: PLATFORM,
      cookie: body.cookie.trim(),
      userAgent: typeof body.userAgent === "string" ? body.userAgent.trim() : undefined,
      origin: ORIGIN,
    };
    const check = await checkPlatformSession(session);
    const now = new Date();

    if (!check.valid) {
      return NextResponse.json({ valid: false, error: check.error }, { status: 400 });
    }

    const stored = await prisma.platformConnection.upsert({
      where: { userId_platform: { userId: user.id, platform: PLATFORM } },
      update: {
        credentials: session.cookie,
        userAgent: session.userAgent ?? null,
        isValid: true,
        lastError: null,
        lastCheckedAt: now,
      },
      create: {
        userId: user.id,
        platform: PLATFORM,
        credentials: session.cookie,
        userAgent: session.userAgent ?? null,
        isValid: true,
        lastCheckedAt: now,
      },
    });

    return NextResponse.json({
      valid: true,
      cookiePreview: maskCookie(stored.credentials),
      lastCheckedAt: now.toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE = forget the stored cookie. */
export async function DELETE(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Unknown workspace", 401);

    await prisma.platformConnection.deleteMany({
      where: { userId: user.id, platform: PLATFORM },
    });
    return NextResponse.json({ connected: false });
  } catch (err) {
    return handleError(err);
  }
}

function maskCookie(cookie: string): string {
  const parts = cookie.split(";").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const tail = last.length > 4 ? `…${last.slice(-4)}` : "…";
  return `${parts.length} cookies, ${tail}`;
}
