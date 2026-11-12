import { NextResponse } from "next/server";
import { getUserForRequest } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  fetchPlatformApplications,
  JobStreetAuthError,
  PLATFORM_ORIGINS,
  type PlatformSession,
} from "@/lib/import/fetch-platform";
import { syncApplications, summarizeCandidates } from "@/lib/services/sync";
import { applyAutoReject } from "@/lib/services/auto-reject";

const PLATFORM = "JobStreet" as const;

/**
 * POST /api/sync/jobstreet
 *
 * Dua mode — keduanya lewat SATU fungsi `fetchPlatformApplications`:
 *  1. Browser relay (extension): body { responses: [GetAppliedJobs graphql
 *     JSON, ...] } — pull sudah jalan di dalam browser user (sesi live,
 *     fingerprint/WAF selalu lolos). Cookie tidak pernah keluar browser.
 *  2. Server-side pull: body { cookie?, userAgent? } — sesi sekali pakai;
 *     atau body kosong → cookie tersimpan di PlatformConnection dipakai.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user)
      return fail("Unknown workspace", 401, "Log in or set X-ApplyTrack-Workspace.");

    let body: { cookie?: unknown; userAgent?: unknown; responses?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      /* empty body is fine — fall back to the stored connection */
    }

    const cookie = typeof body.cookie === "string" ? body.cookie.trim() : "";
    const userAgent =
      typeof body.userAgent === "string" ? body.userAgent.trim() : undefined;

    const stored = await prisma.platformConnection.findUnique({
      where: { userId_platform: { userId: user.id, platform: PLATFORM } },
    });

    // Mode 1 — browser relay: parse the already-fetched graphql responses.
    const responses = Array.isArray(body.responses)
      ? body.responses.filter((r) => r && typeof r === "object")
      : [];
    if (responses.length) {
      const pulled = await fetchPlatformApplications(
        { platform: PLATFORM, cookie: "" },
        { browserPayloads: { platform: PLATFORM, jobstreetResponses: responses } },
      );
      if (!pulled.candidates.length) {
        return fail(
          "No JobStreet applications found",
          422,
          "The browser session is valid but id.jobstreet.com has no applied jobs to import yet.",
        );
      }

      const summary = await syncApplications(user.id, pulled.candidates);
      await applyAutoReject(user.id);

      // The live session works — refresh the stored connection metadata
      // (no cookie to store: the pull happens inside the browser).
      if (stored) {
        await prisma.platformConnection.update({
          where: { userId_platform: { userId: user.id, platform: PLATFORM } },
          data: {
            isValid: true,
            lastError: null,
            lastSyncedAt: new Date(),
            lastCheckedAt: new Date(),
          },
        });
      }

      return NextResponse.json({
        summary,
        imported: summarizeCandidates(pulled.candidates),
        counts: pulled.counts,
        sessionValid: true,
        source: pulled.source,
      });
    }

    const session: PlatformSession | null = cookie
      ? { platform: PLATFORM, cookie, userAgent, origin: PLATFORM_ORIGINS.JobStreet }
      : stored?.credentials
        ? {
            platform: PLATFORM,
            cookie: stored.credentials,
            userAgent: stored.userAgent ?? undefined,
            origin: PLATFORM_ORIGINS.JobStreet,
          }
        : null;

    if (!session) {
      return fail(
        "No JobStreet session available",
        422,
        "Open /sync, paste your jobstreet.com Cookie header once and press Connect — afterwards one click syncs everything.",
      );
    }

    try {
      const pulled = await fetchPlatformApplications(session);
      if (!pulled.candidates.length) {
        return fail(
          "No JobStreet applications found",
          422,
          "The session is valid but id.jobstreet.com/id/my-activity/applied-jobs has nothing to import.",
        );
      }

      const summary = await syncApplications(user.id, pulled.candidates);
      await applyAutoReject(user.id);

      // The cookie we just used works — keep it for future one-click syncs.
      await prisma.platformConnection.upsert({
        where: { userId_platform: { userId: user.id, platform: PLATFORM } },
        update: {
          credentials: cookie || stored?.credentials || "",
          userAgent: userAgent ?? stored?.userAgent ?? null,
          isValid: true,
          lastError: null,
          lastSyncedAt: new Date(),
          lastCheckedAt: new Date(),
        },
        create: {
          userId: user.id,
          platform: PLATFORM,
          credentials: cookie || stored?.credentials || "",
          userAgent: userAgent ?? null,
          isValid: true,
          lastSyncedAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });

      return NextResponse.json({
        summary,
        imported: summarizeCandidates(pulled.candidates),
        counts: pulled.counts,
        sessionValid: true,
        source: pulled.source,
      });
    } catch (err) {
      if (err instanceof JobStreetAuthError) {
        await prisma.platformConnection.updateMany({
          where: { userId: user.id, platform: PLATFORM },
          data: { isValid: false, lastError: err.message, lastCheckedAt: new Date() },
        });
        return fail(
          "JobStreet session expired",
          401,
          "Log in to id.jobstreet.com, copy the Cookie header again and press Connect in /sync.",
        );
      }
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
}
