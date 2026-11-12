/**
 * Satu fungsi fetch untuk semua platform: `fetchPlatformApplications`.
 *
 * Sebelumnya JobStreet dan Glints punya jalur fetch sendiri-sendiri yang
 * diduplikasi di tiap API route (server pull + browser relay + cek sesi):
 *  - JobStreet: `pullJobStreetApplications` (GraphQL `GetAppliedJobs`)
 *  - Glints:    `pullGlintsApplications` (REST list + companies + details)
 *
 * Sekarang semua jalur itu lewat satu pintu masuk ini. Route hanya perlu
 * menyebut platform + sesi + (opsional) payload yang sudah diambil browser,
 * dan fungsi ini yang memilih cara ambilnya:
 *  - `browserPayloads` terisi  -> tanpa request ke platform, cukup
 *    normalisasi payload mentah dari extension (Glints diblokir firewall
 *    untuk request server, JobStreet relay GraphQL dari browser).
 *  - `browserPayloads` kosong -> tarik langsung dari server dengan cookie
 *    sesi (JobStreet selalu bisa; Glints bisa gagal `GlintsBlockedError`
 *    kalau firewall menolak — error itu diteruskan apa adanya supaya route
 *    bisa menyuruh user sync lewat extension).
 *
 * Hasilnya selalu bentuk yang sama: `{ platform, candidates, counts, source }`
 * sehingga `syncApplications` + `summarizeCandidates` di route tidak perlu
 * tahu platform apa yang sedang di-sync.
 */

import {
  aggregateGlintsPayloads,
  checkGlintsSession,
  GlintsAuthError,
  GlintsBlockedError,
  pullGlintsApplications,
  type GlintsPullOptions,
  type GlintsRawPayloads,
} from "@/lib/import/glints-client";
import type { GlintsSession } from "@/lib/import/glints";
import { absorbAppliedJobsResponse } from "@/lib/import/jobstreet";
import {
  checkJobStreetSession,
  JobStreetAuthError,
  pullJobStreetApplications,
  type JobStreetSession,
} from "@/lib/import/jobstreet-client";
import type {
  PlatformApplicationCandidate,
  PlatformName,
} from "@/lib/import/platform";

export { GlintsAuthError, GlintsBlockedError, JobStreetAuthError };

/** Sesi login ke satu platform — cookie tidak pernah dikembalikan ke client. */
export type PlatformSession = {
  platform: PlatformName;
  cookie: string;
  userAgent?: string;
  /** Default: `https://glints.com` / `https://id.jobstreet.com`. */
  origin?: string;
};

export const PLATFORM_ORIGINS: Record<PlatformName, string> = {
  Glints: "https://glints.com",
  JobStreet: "https://id.jobstreet.com",
};

/** Payload mentah yang sudah diambil di dalam browser user (extension). */
export type BrowserPayloads =
  | { platform: "Glints"; glints: GlintsRawPayloads }
  | { platform: "JobStreet"; jobstreetResponses: unknown[] };

export type FetchPlatformOptions = {
  /** Payload dari browser — kalau ada, tidak ada request server → platform. */
  browserPayloads?: BrowserPayloads;
  /** Diteruskan ke pull Glints (progress + mode cepat untuk test). */
  onProgress?: GlintsPullOptions["onProgress"];
  /** Disable jeda antar-request (test saja). */
  fast?: boolean;
};

export type FetchPlatformResult = {
  platform: PlatformName;
  candidates: PlatformApplicationCandidate[];
  /** Bentuk counts dipertahankan per platform supaya respons API tidak berubah. */
  counts: { list: number; details?: number; companies?: number };
  source: "server" | "browser";
};

function toGlintsSession(session: PlatformSession): GlintsSession {
  return {
    cookie: session.cookie,
    origin: session.origin ?? PLATFORM_ORIGINS.Glints,
    source: "manual",
    userAgent: session.userAgent,
  };
}

function toJobStreetSession(session: PlatformSession): JobStreetSession {
  return {
    cookie: session.cookie,
    userAgent: session.userAgent,
    origin: session.origin ?? PLATFORM_ORIGINS.JobStreet,
  };
}

/** Normalisasi payload Glints dari extension (tanpa request ke glints.com). */
function fromGlintsBrowserPayloads(
  payloads: GlintsRawPayloads,
): FetchPlatformResult {
  const { candidates, counts } = aggregateGlintsPayloads(payloads);
  return { platform: "Glints", candidates, counts, source: "browser" };
}

/** Normalisasi respons GraphQL JobStreet dari extension (tanpa request). */
function fromJobStreetBrowserResponses(
  responses: unknown[],
): FetchPlatformResult {
  const byId = new Map<string, PlatformApplicationCandidate>();
  let nodes = 0;
  for (const json of responses) {
    absorbAppliedJobsResponse(json, byId);
    const edges = (
      json as { data?: { viewer?: { appliedJobs?: { edges?: unknown[] } } } }
    )?.data?.viewer?.appliedJobs?.edges;
    if (Array.isArray(edges)) nodes += edges.length;
  }
  const candidates = [...byId.values()].sort(
    (a, b) => b.appliedAt.getTime() - a.appliedAt.getTime(),
  );
  return {
    platform: "JobStreet",
    candidates,
    counts: { list: nodes },
    source: "browser",
  };
}

/**
 * SATU fungsi fetch untuk JobStreet dan Glints.
 *
 * @example server pull
 *   const pulled = await fetchPlatformApplications({
 *     platform: "JobStreet", cookie: stored.credentials,
 *   });
 *
 * @example browser relay (extension sudah mengambil datanya)
 *   const pulled = await fetchPlatformApplications(
 *     { platform: "Glints", cookie: "" },
 *     { browserPayloads: { platform: "Glints", glints: payloads } },
 *   );
 */
export async function fetchPlatformApplications(
  session: PlatformSession,
  options: FetchPlatformOptions = {},
): Promise<FetchPlatformResult> {
  const { browserPayloads } = options;

  if (browserPayloads) {
    if (session.platform === "Glints" && browserPayloads.platform === "Glints") {
      return fromGlintsBrowserPayloads(browserPayloads.glints);
    }
    if (
      session.platform === "JobStreet" &&
      browserPayloads.platform === "JobStreet"
    ) {
      return fromJobStreetBrowserResponses(browserPayloads.jobstreetResponses);
    }
    throw new Error(
      `Browser payloads untuk ${browserPayloads.platform} tidak cocok dengan platform ${session.platform}`,
    );
  }

  if (session.platform === "JobStreet") {
    const pulled = await pullJobStreetApplications(
      toJobStreetSession(session),
    );
    return {
      platform: "JobStreet",
      candidates: pulled.candidates,
      counts: pulled.counts,
      source: "server",
    };
  }

  const pulled = await pullGlintsApplications(toGlintsSession(session), {
    onProgress: options.onProgress,
    fast: options.fast,
  });
  return {
    platform: "Glints",
    candidates: pulled.candidates,
    counts: pulled.counts,
    source: "server",
  };
}

export type CheckPlatformSessionResult = {
  valid: boolean;
  /** True kalau Glints Firewall yang menolak (bukan cookie yang salah). */
  blocked?: boolean;
  error?: string;
};

/**
 * Cek sesi satu platform — pasangan dari `fetchPlatformApplications`,
 * supaya route `/connection` Glints dan JobStreet juga tidak menduplikasi
 * logika cek (probe 1 item + bedakan auth vs firewall).
 */
export async function checkPlatformSession(
  session: PlatformSession,
): Promise<CheckPlatformSessionResult> {
  if (session.platform === "JobStreet") {
    return checkJobStreetSession(toJobStreetSession(session));
  }
  return checkGlintsSession(toGlintsSession(session));
}
