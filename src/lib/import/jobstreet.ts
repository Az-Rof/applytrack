/**
 * JobStreet (SEEK Indonesia) HAR parser + shared normalizer.
 *
 * Data source (captured in a HAR from the "My activity → applied-jobs" page):
 *   POST https://id.jobstreet.com/graphql   operationName=GetAppliedJobs
 *   response: data.viewer.appliedJobs.edges[].node — one entry per submitted
 *   application, including the FULL status timeline (`events`) and job details
 *   (title / location / advertiser / salary). A single graphql response carries
 *   everything — no per-application detail requests are needed (unlike Glints).
 *
 * Pure functions only — no network, no database, so this can be unit tested
 * standalone. The live-pull client reuses `absorbAppliedJobsResponse`.
 */

import {
  mapPlatformStatus,
  type PlatformApplicationCandidate,
  type PlatformStatusEvent,
} from "@/lib/import/platform";

/* --------------------------------------------------------------- raw types */

type HarEntry = {
  request: {
    method?: string;
    url: string;
    postData?: { text?: string };
  };
  response: {
    status?: number;
    content?: { mimeType?: string; encoding?: string; text?: string };
  };
};

type Har = { log?: { entries?: HarEntry[] } };

type RawSeekDateTime = { dateTimeUtc?: string | null; shortAbsoluteLabel?: string | null };

/** One `appliedJobs.edges[].node` of the GetAppliedJobs response. */
export type RawAppliedJobNode = {
  id?: string | null;
  /** Stable per-application request id (UUID) — used as externalId. */
  applicationRequestId?: string | null;
  isActive?: boolean | null;
  notes?: string | null;
  events?: Array<{
    status?: string | null;
    timestamp?: RawSeekDateTime | null;
  }> | null;
  appliedAt?: RawSeekDateTime | null;
  job?: {
    id?: string | null;
    title?: string | null;
    location?: { label?: string | null } | null;
    abstract?: string | null;
    listedAt?: RawSeekDateTime | null;
    advertiser?: { id?: string | null; name?: string | null } | null;
    salary?: { label?: string | null } | null;
  } | null;
};

/* ------------------------------------------------- status / value mapping */

/** JobStreet status map — defined in the shared platform module. */
export { JOBSTREET_STATUS_MAP } from "@/lib/import/platform";

export function mapJobStreetStatus(status?: string | null) {
  return mapPlatformStatus("JobStreet", status);
}

/** Canonical public job URL derived from the posting id. */
export function jobStreetJobUrl(jobId: string): string {
  return `https://id.jobstreet.com/id/job/${jobId}`;
}

/* -------------------------------------------------------------- extraction */

function parseSeekDateTime(dt?: RawSeekDateTime | null): Date | undefined {
  const raw = dt?.dateTimeUtc;
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Turn a GetAppliedJobs node into a candidate. Missing advertiser/location/
 * salary are tolerated; a job id plus either `appliedAt` or events is
 * mandatory.
 */
export function normalizeAppliedJobNode(
  node: RawAppliedJobNode,
): PlatformApplicationCandidate | undefined {
  const jobId = typeof node.job?.id === "string" && node.job.id.trim() ? node.job.id.trim() : null;
  if (!jobId) return undefined;

  const events: PlatformStatusEvent[] = (node.events ?? [])
    .map((e) => {
      const at = parseSeekDateTime(e?.timestamp);
      return e?.status && at
        ? ({ status: e.status, at } satisfies PlatformStatusEvent)
        : null;
    })
    .filter((e): e is PlatformStatusEvent => e !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const appliedAt =
    parseSeekDateTime(node.appliedAt) ?? events[0]?.at ?? undefined;
  if (!appliedAt) return undefined;

  const externalId =
    typeof node.applicationRequestId === "string" && node.applicationRequestId.trim()
      ? node.applicationRequestId.trim()
      : `job-${jobId}`;

  return {
    platform: "JobStreet",
    externalId,
    jobExternalId: jobId,
    appliedAt,
    // Last timeline event = where the application is now (e.g. NotSuitable).
    platformStatus: events.length ? events[events.length - 1].status : "Applied",
    jobTitle: (node.job?.title ?? "").trim() || `JobStreet job ${jobId}`,
    companyName: node.job?.advertiser?.name?.trim() || "Unknown Company",
    location: node.job?.location?.label?.trim() || undefined,
    // SEEK hands a pre-formatted label, e.g. "Rp 5.500.000 – Rp 7.000.000 per month".
    salary: node.job?.salary?.label?.trim() || undefined,
    jobUrl: jobStreetJobUrl(jobId),
    timeline: events.length ? events : undefined,
    // JobStreet exposes no posting-closed/moderation signals in this query.
  };
}

/**
 * Absorb one GetAppliedJobs graphql response into the dedupe map.
 * Duplicated nodes (same externalId) merge: the view with the richer
 * (more recent / longer) timeline wins.
 */
export function absorbAppliedJobsResponse(
  json: unknown,
  into: Map<string, PlatformApplicationCandidate>,
): void {
  const edges = (json as { data?: { viewer?: { appliedJobs?: { edges?: Array<{ node?: RawAppliedJobNode }> } } } })
    ?.data?.viewer?.appliedJobs?.edges;
  if (!Array.isArray(edges)) return;

  for (const edge of edges) {
    const node = edge?.node;
    if (!node) continue;
    const next = normalizeAppliedJobNode(node);
    if (!next) continue;
    const prev = into.get(next.externalId);
    into.set(
      next.externalId,
      prev ? mergeAppliedJob(prev, next) : next,
    );
  }
}

function mergeAppliedJob(
  prev: PlatformApplicationCandidate,
  next: PlatformApplicationCandidate,
): PlatformApplicationCandidate {
  const prevLast = prev.timeline?.[prev.timeline.length - 1];
  const nextLast = next.timeline?.[next.timeline.length - 1];
  if (!nextLast || (prevLast && prevLast.at >= nextLast.at)) return prev;
  return { ...next, appliedAt: prev.appliedAt < next.appliedAt ? prev.appliedAt : next.appliedAt };
}

function decodeEntry(entry: HarEntry): unknown | undefined {
  const content = entry.response.content;
  if (!content?.text) return undefined;
  const mime = content.mimeType ?? "";
  if (mime && !/json/i.test(mime)) return undefined;
  try {
    if (content.encoding === "base64") {
      return JSON.parse(Buffer.from(content.text, "base64").toString("utf8"));
    }
    return JSON.parse(content.text);
  } catch {
    return undefined;
  }
}

/**
 * Parse a JobStreet HAR (already JSON-parsed) into deduplicated candidates.
 */
export function extractJobStreetCandidates(har: unknown): {
  candidates: PlatformApplicationCandidate[];
} {
  const entries = ((har as Har | null)?.log?.entries ?? []) as HarEntry[];
  const byId = new Map<string, PlatformApplicationCandidate>();

  for (const entry of entries) {
    const url = entry.request.url;
    if (!url.includes("/graphql")) continue;
    const requestBody = entry.request.postData?.text ?? "";
    if (!requestBody.includes("GetAppliedJobs")) continue;
    const json = decodeEntry(entry);
    if (!json) continue;
    absorbAppliedJobsResponse(json, byId);
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.appliedAt.getTime() - a.appliedAt.getTime(),
  );
  return { candidates };
}
