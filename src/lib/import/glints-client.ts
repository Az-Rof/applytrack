/**
 * Glints fetch — TANPA cookie di server (12 Nov 2026).
 *
 * Dulu file ini juga berisi pull server-side (`pullGlintsApplications`,
 * `checkGlintsSession`) yang memakai session cookie Glints yang disimpan
 * di `PlatformConnection`. Itu dihapus: fetch lowongan yang di-apply kini
 * HANYA jalan di dalam browser user lewat extension, persis konsep awal
 * project ini:
 *
 *  1. Extension (di glints.com, user sudah login) memanggil API Glints
 *     di dalam browser itu sendiri — cookie sesi Glints tidak pernah
 *     keluar dari browser user, tidak pernah dikirim atau disimpan di
 *     server ApplyTrack.
 *  2. Yang dikirim ke server hanya payload JSON mentahnya
 *     (`{ list, details, companies }`).
 *  3. Yang dilakukan file ini: menormalisasi payload mentah itu menjadi
 *     kandidat lamaran lewat SATU fungsi, `aggregateGlintsPayloads` —
 *     dipakai `/api/sync/glints` (extension) dan `/api/sync/har` (file
 *     HAR) — tanpa satu pun request dari server ke glints.com.
 */

import { createGlintsAggregator } from "@/lib/import/glints";
import type { PlatformApplicationCandidate } from "@/lib/import/platform";

/** Raw API responses captured by the extension inside the user's browser. */
export type GlintsRawPayloads = {
  /** Rows from GET /api/me/applications (paged list). */
  list: unknown[];
  /** Bodies of GET /api/me/applications/{id} (status timelines). */
  details: unknown[];
  /** Bodies of GET /api/companies (names/locations). */
  companies: unknown[];
};

/**
 * Feed raw payloads captured by the extension through the same normalizer the
 * HAR importer uses, without any server→glints.com request (the Firewall
 * blocks those anyway).
 */
export function aggregateGlintsPayloads(payloads: GlintsRawPayloads): {
  candidates: PlatformApplicationCandidate[];
  counts: { list: number; details: number; companies: number };
} {
  const agg = createGlintsAggregator();
  for (const company of payloads.companies) {
    if (company) agg.absorbCompanies(company);
  }
  agg.takeApplications(payloads.list);
  for (const detail of payloads.details) {
    const data = (detail as { data?: unknown })?.data;
    if (data) agg.takeApplications([data]);
  }
  return {
    candidates: agg.candidates,
    counts: {
      list: payloads.list.length,
      details: payloads.details.length,
      companies: agg.companiesFound,
    },
  };
}
