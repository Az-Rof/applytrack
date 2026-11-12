/**
 * Satu fungsi fetch untuk Glints: `fetchGlintsApplications`.
 *
 * Dulu file ini (`fetch-platform.ts`) melayani dua platform — JobStreet
 * dan Glints — lewat satu fungsi `fetchPlatformApplications`. Pada 12 Nov
 * 2026 sync JobStreet dihapus dulu (sync-nya gagal, fokus ke Glints),
 * jadi yang tersisa satu platform dan satu fungsi ini:
 *  - `browserPayloads` terisi  -> tanpa request ke platform, cukup
 *    normalisasi payload mentah dari extension (Glints diblokir firewall
 *    untuk request server, jadi pull selalu jalan di dalam browser user).
 *  - `browserPayloads` kosong -> tarik langsung dari server dengan cookie
 *    sesi (bisa gagal `GlintsBlockedError` kalau firewall menolak — error
 *    itu diteruskan apa adanya supaya route bisa menyuruh user sync lewat
 *    extension).
 *
 * Hasilnya selalu bentuk yang sama: `{ candidates, counts, source }`
 * sehingga `syncApplications` + `summarizeCandidates` di route tidak perlu
 * tahu dari mana candidates itu datang.
 */

import {
  aggregateGlintsPayloads,
  GlintsAuthError,
  GlintsBlockedError,
  pullGlintsApplications,
  type GlintsPullOptions,
  type GlintsRawPayloads,
} from "@/lib/import/glints-client";
import type { PlatformApplicationCandidate } from "@/lib/import/platform";

export { GlintsAuthError, GlintsBlockedError };

export const GLINTS_ORIGIN = "https://glints.com";

/** Sesi login Glints — cookie tidak pernah dikembalikan ke client. */
export type GlintsFetchSession = {
  cookie: string;
  userAgent?: string;
  /** Default: `https://glints.com`. */
  origin?: string;
};

export type FetchGlintsOptions = {
  /** Payload dari browser — kalau ada, tidak ada request server → glints.com. */
  browserPayloads?: GlintsRawPayloads;
  /** Diteruskan ke pull Glints (progress + mode cepat untuk test). */
  onProgress?: GlintsPullOptions["onProgress"];
  /** Disable jeda antar-request (test saja). */
  fast?: boolean;
};

export type FetchGlintsResult = {
  candidates: PlatformApplicationCandidate[];
  counts: { list: number; details: number; companies: number };
  source: "server" | "browser";
};

/**
 * SATU fungsi fetch untuk Glints.
 *
 * @example server pull
 *   const pulled = await fetchGlintsApplications({ cookie: stored.credentials });
 *
 * @example browser relay (extension sudah mengambil datanya)
 *   const pulled = await fetchGlintsApplications(
 *     { cookie: "" },
 *     { browserPayloads: payloads },
 *   );
 */
export async function fetchGlintsApplications(
  session: GlintsFetchSession,
  options: FetchGlintsOptions = {},
): Promise<FetchGlintsResult> {
  if (options.browserPayloads) {
    const { candidates, counts } = aggregateGlintsPayloads(
      options.browserPayloads,
    );
    return { candidates, counts, source: "browser" };
  }

  const pulled = await pullGlintsApplications(
    {
      cookie: session.cookie,
      origin: session.origin ?? GLINTS_ORIGIN,
      source: "manual",
      userAgent: session.userAgent,
    },
    {
      onProgress: options.onProgress,
      fast: options.fast,
    },
  );
  return {
    candidates: pulled.candidates,
    counts: pulled.counts,
    source: "server",
  };
}
