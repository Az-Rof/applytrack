import { NextResponse } from "next/server";
import { getUserForRequest } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { checkGlintsSession } from "@/lib/import/glints-client";
import { extractGlintsSession, type GlintsSession } from "@/lib/import/glints";
import { GLINTS_ORIGIN } from "@/lib/import/glints-fetch";

const PLATFORM = "Glints" as const;

/** Masked connection info — the raw cookie is never returned to any client. */
export async function GET(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Not logged in", 401);

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
 * POST /api/sync/glints/connection
 * Body options:
 *  - { cookie }            → save this cookie after validating it (web UI paste)
 *  - { harFile: string }    → extract a cookie from a pasted/uploaded HAR text
 * The cookie is validated with a cheap authenticated request before saving.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Not logged in", 401, "Log in first.");

    let body: { cookie?: unknown; harFile?: unknown; userAgent?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return fail("Send JSON: { cookie } or { harFile }.", 400);
    }

    const userAgent =
      typeof body.userAgent === "string" && body.userAgent.trim()
        ? body.userAgent.trim()
        : undefined;

    let extracted: { cookie: string; userAgent?: string } | null = null;
    if (typeof body.cookie === "string" && body.cookie.trim()) {
      extracted = { cookie: body.cookie.trim() };
    } else if (typeof body.harFile === "string" && body.harFile.trim()) {
      try {
        const session = extractGlintsSession(JSON.parse(body.harFile));
        if (session) {
          extracted = {
            cookie: session.cookie,
            userAgent: session.userAgent ?? userAgent,
          };
        }
      } catch {
        return fail("harFile is not valid JSON (paste the raw HAR file contents).", 422);
      }
      if (!extracted) {
        return fail(
          "No Cookie header found in that HAR — paste it manually instead.",
          422,
        );
      }
    } else {
      return fail("Provide `cookie` or `harFile`.", 400);
    }

    const session: GlintsSession = {
      cookie: extracted.cookie,
      userAgent: extracted.userAgent,
      origin: GLINTS_ORIGIN,
      source: "manual",
    };
    const check = await checkGlintsSession(session);
    const now = new Date();

    if (!check.valid) {
      // Never persist credentials that could not be verified.
      return NextResponse.json(
        { valid: false, error: check.error },
        { status: 400 },
      );
    }

    const stored = await prisma.platformConnection.upsert({
      where: { userId_platform: { userId: user.id, platform: PLATFORM } },
      update: {
        credentials: extracted.cookie,
        userAgent: extracted.userAgent ?? null,
        isValid: true,
        lastError: null,
        lastCheckedAt: now,
      },
      create: {
        userId: user.id,
        platform: PLATFORM,
        credentials: extracted.cookie,
        userAgent: extracted.userAgent ?? null,
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
    if (!user) return fail("Not logged in", 401);

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
