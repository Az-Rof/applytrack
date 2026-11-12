import { NextResponse } from "next/server";
import { getUserForRequest, extensionApiKeyError } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import {
  aggregateGlintsPayloads,
  type GlintsRawPayloads,
} from "@/lib/import/glints-client";
import {
  syncApplications as syncRows,
  summarizeCandidates,
} from "@/lib/services/sync";
import { applyAutoReject } from "@/lib/services/auto-reject";

/**
 * POST /api/sync/glints  { payloads: { list, details, companies } }
 *
 * TANPA cookie — fetch lowongan yang di-apply HANYA jalan di dalam browser
 * user lewat extension (konsep awal project ini). Extension sudah login di
 * glints.com, menarik semuanya di dalam browser itu sendiri (firewall
 * Glints memblokir request server), lalu mengirim HANYA payload JSON
 * mentahnya ke sini. Cookie sesi Glints tidak pernah dikirim ke atau
 * disimpan di server ApplyTrack — tidak ada lagi pull server-side, tidak
 * ada lagi cookie tersimpan.
 *
 * Di sini payload mentah itu dinormalisasi (SATU fungsi:
 * `aggregateGlintsPayloads`) lalu di-upsert seperti biasa.
 */
export async function POST(request: Request) {
  try {
    const apiKeyError = extensionApiKeyError(request);
    if (apiKeyError) return apiKeyError;

    const user = await getUserForRequest(request);
    if (!user) return fail("Not logged in", 401, "Log in first.");

    let body: { payloads?: Partial<GlintsRawPayloads> } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return fail(
        "Missing payloads",
        400,
        "Press “Sync Glints applications” in the ApplyTrack extension — it pulls your applications inside your browser and sends them here.",
      );
    }

    const payloads = body.payloads;
    if (
      !payloads ||
      !Array.isArray(payloads.list) ||
      (payloads.details !== undefined && !Array.isArray(payloads.details)) ||
      (payloads.companies !== undefined && !Array.isArray(payloads.companies))
    ) {
      return fail(
        "Malformed payloads",
        400,
        "Expected { payloads: { list: unknown[], details?: unknown[], companies?: unknown[] } }.",
      );
    }
    if (payloads.list.length > 5000 || (payloads.details?.length ?? 0) > 5000) {
      return fail("Payload too large", 413);
    }

    const pulled = aggregateGlintsPayloads({
      list: payloads.list,
      details: payloads.details ?? [],
      companies: payloads.companies ?? [],
    });
    if (!pulled.candidates.length) {
      return fail(
        "No applications found in the payloads",
        422,
        "Open glints.com and make sure you are logged in, then retry the extension Sync.",
      );
    }

    const summary = await syncRows(user.id, pulled.candidates);
    await applyAutoReject(user.id);

    return NextResponse.json({
      summary,
      imported: summarizeCandidates(pulled.candidates),
      counts: pulled.counts,
      sessionValid: true,
      source: "extension",
    });
  } catch (err) {
    return handleError(err);
  }
}
