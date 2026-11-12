import { NextResponse } from "next/server";
import { getUserForRequest } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import { extractGlintsCandidates } from "@/lib/import/glints";
import type { PlatformApplicationCandidate } from "@/lib/import/platform";
import { syncApplications, summarizeCandidates } from "@/lib/services/sync";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // HAR files can get large; be generous

/**
 * POST /api/sync/har
 *
 * Body (multipart/form-data):
 *  - file → the captured .har file (required). Glints-only: the HAR must
 *    be captured on glints.com (My Applications page).
 *
 * TANPA cookie — route ini hanya membaca ISI RESPONS API yang sudah ada
 * di dalam file HAR (bukan header Cookie, bukan live-pull). Dulu ada
 * fullSync yang memakai cookie dari HAR untuk menarik semua lamaran
 * langsung dari server; itu dihapus 12 Nov 2026 bersama pull server-side:
 * fetch lowongan yang di-apply kini hanya lewat extension di browser user.
 *
 * Returns a per-run summary; safe to repeat (idempotent upsert).
 */
export async function POST(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Not logged in", 401, "Open the app and login first.");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail("Send the HAR file as multipart/form-data (field `file`).", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      return fail("Missing `file` field (upload a .har capture).", 400);
    }
    if (file.size > MAX_FILE_BYTES) {
      return fail("HAR file too large (>60MB).", 413);
    }
    if (!/\.har$/i.test(file.name) && !/json/i.test(file.type ?? "")) {
      return fail("The uploaded file does not look like a HAR file.", 422);
    }

    let har: unknown;
    try {
      har = JSON.parse(await file.text());
    } catch {
      return fail("Could not parse the HAR file (invalid JSON).", 422);
    }
    if (
      !har ||
      typeof har !== "object" ||
      !Array.isArray((har as { log?: { entries?: unknown[] } }).log?.entries)
    ) {
      return fail("Not a HAR capture — export from browser DevTools (Network → Export HAR).", 422);
    }

    /* Glints-only: parse the HAR's Glints candidates. */
    const candidates: PlatformApplicationCandidate[] = [
      ...extractGlintsCandidates(har).candidates,
    ].sort((x, y) => y.appliedAt.getTime() - x.appliedAt.getTime());
    if (!candidates.length) {
      return fail(
        "No Glints applications found in this HAR. Capture while browsing glints.com/id/user/applications before exporting.",
        422,
      );
    }

    const summary = await syncApplications(user.id, candidates);

    return NextResponse.json({
      summary,
      livePull: { used: false },
      imported: summarizeCandidates(candidates),
    });
  } catch (err) {
    return handleError(err);
  }
}
