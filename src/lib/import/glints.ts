/**
 * Glints HAR parser.
 *
 * Extracts the user's submitted applications from a HAR file captured on the
 * "My Applications" page (glints.com). Pure functions only — no network, no
 * database, so this can be unit tested standalone.
 *
 * HAR responses used (all authenticated glints.com endpoints):
 *  - POST /api/graphql?op=getApplications  → list incl. job, salaries,
 *    hierarchical location and company (name/brandName)
 *  - GET  /api/me/applications?include=Job → list (job without company)
 *  - GET  /api/me/applications/{id}?…includeApplicationStatusTracking=true
 *      → per-application status timeline (status + date + message)
 *  - GET  /api/companies?…where={"id":{"$in":[…]}} → company names + location
 */

import type { ApplicationStatus } from "@/lib/status";
import {
  mapPlatformStatus,
  type PlatformApplicationCandidate,
  type PlatformStatusEvent,
} from "@/lib/import/platform";

/* ------------------------------------------------------------------ types */

/**
 * Normalized application candidate ready for the sync service (platform set
 * to "Glints" by every parser here).
 */
export type GlintsApplicationCandidate = PlatformApplicationCandidate;

/* ------------------------------------------------- status / value mapping */

/** Glints status map — defined in the shared platform module. */
export { GLINTS_STATUS_MAP } from "@/lib/import/platform";

export function mapGlintsStatus(status?: string | null): ApplicationStatus {
  return mapPlatformStatus("Glints", status);
}

/** Rough progression rank, used to merge conflicting views of one apply. */
const GLINTS_STATUS_RANK: Record<string, number> = {
  NEW: 0,
  IN_REVIEW: 1,
  ASSESSMENT: 2,
  INTERVIEWING: 3,
  OFFERED: 4,
  HIRED: 4,
  REJECTED: 4,
};

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  PROJECT_BASED: "Freelance",
};

function mapEmploymentType(raw?: string | null): string | undefined {
  return raw ? EMPLOYMENT_TYPE_MAP[raw.toUpperCase()] : undefined;
}

function formatSalary(
  salaries?: RawSalary[],
): string | undefined {
  const first = (salaries ?? [])
    .filter((s) => typeof s.minAmount === "number" || typeof s.maxAmount === "number")
    .sort((a, b) => (a.minAmount ?? 0) - (b.minAmount ?? 0))[0];
  if (!first) return undefined;

  const min = first.minAmount ?? first.maxAmount;
  const max = first.maxAmount ?? first.minAmount;
  if (min == null || max == null) return undefined;
  const currency = first.CurrencyCode || "IDR";
  const fmt = (n: number) => n.toLocaleString("id-ID");
  const range = min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  const mode = first.salaryMode ? ` / ${first.salaryMode.toLowerCase()}` : "";
  return `${currency} ${range}${mode}`;
}

/**
 * Location: prefer the city from a hierarchical location path
 * (district → city → province → country); Glints levels: 1 country,
 * 2 province, 3 city, 4 district.
 */
function mapLocation(
  location?: RawLocation | null,
  country?: string | null,
): string | undefined {
  if (!location) return country ?? undefined;
  const parents = location.parents ?? [];
  const city = location.level === 3 ? location.name : parents.find((p) => p.level === 3)?.name;
  const district = location.level === 4 ? location.name : parents.find((p) => p.level === 4)?.name;
  return city ?? district ?? country ?? undefined;
}

/** Canonical public job URL derived from the job UUID. */
export function glintsJobUrl(jobId: string): string {
  return `https://glints.com/id/jobs/${jobId}`;
}

/* --------------------------------------------------------------- raw types */

type RawSalary = {
  minAmount?: number | null;
  maxAmount?: number | null;
  CurrencyCode?: string | null;
  salaryMode?: string | null;
};

type RawLocation = {
  name?: string | null;
  level?: number | null;
  parents?: Array<{ name?: string | null; level?: number | null }>;
};

type HarEntry = {
  request: {
    method?: string;
    url: string;
    headers?: Array<{ name: string; value: string }>;
    cookies?: Array<{ name: string; value: string }>;
    postData?: { text?: string };
  };
  response: {
    status?: number;
    content?: { mimeType?: string; encoding?: string; text?: string };
  };
};

type Har = { log?: { entries?: HarEntry[] } };

// Shapes sliced out of the Glints API payloads. IDs are UUIDs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawJob = {
  id?: string | null;
  title?: string | null;
  type?: string | null;
  /** e.g. "OPEN" | "CLOSED" — a CLOSED posting no longer accepts applies. */
  status?: string | null;
  /** Set when the posting gets taken down (the "Loker Dihapus" chip). */
  closedAt?: string | null;
  /** Glints moderation flag, e.g. "VERIFIED_SCAM_FRAUD". */
  fraudReportFlag?: string | null;
  salaries?: RawSalary[];
  location?: RawLocation | null;
  country?: { name?: string | null; code?: string | null };
  CompanyId?: string | null;
  company?: { id: string; name?: string | null; brandName?: string | null } | null; // GraphQL
  links?: {
    company?: { id: string; name?: string | null; brandName?: string | null } | null;
    jobSalaries?: RawSalary[];
    city?: { name?: string | null } | null;
  } | null;
};

type RawApplication = {
  id: string;
  createdAt?: string | null;
  status?: string | null;
  source?: string | null;
  JobId?: string | null;
  job?: RawJob | null;               // GraphQL shape
  links?: { job?: RawJob | null };   // REST shape
  applicationStatusTracking?: Array<{
    status?: string | null;
    createdAt?: string | null;
    message?: string | null;
  }> | null;
};

type RawCompany = { id: string; name?: string | null; brandName?: string | null };
type CompanyInfo = { name?: string; location?: string };
type CompanyLookup = Record<string, CompanyInfo | undefined>;

type ParsedJson = { data?: unknown };

/* -------------------------------------------------------------- extraction */

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

function isUuid(v?: string | null): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function collectCompanies(json: unknown, bucket: CompanyLookup) {
  // Responses are JSON:API-ish: { links, data: [...], count }
  const list = (json as ParsedJson)?.data;
  if (!Array.isArray(list)) return;
  for (const c of list as RawCompany[]) {
    if (!isUuid(c?.id)) continue;
    const city = mapLocation((c as unknown as { hierarchicalLocation?: RawLocation }).hierarchicalLocation);
    bucket[c.id] = { name: c.brandName?.trim() || c.name?.trim() || undefined, location: city };
  }
}

function normalizeApplication(
  raw: RawApplication,
  companies: CompanyLookup,
): GlintsApplicationCandidate | undefined {
  const externalId = raw.id;
  const job = raw.job ?? raw.links?.job ?? undefined;
  if (!isUuid(externalId) || !isUuid(job?.id) || !raw.createdAt) return undefined;

  // Company sources, best first: GraphQL inline → JSON:API links inline →
  // the separately-fetched /api/companies payloads.
  const inlineCompany =
    job!.company ?? job!.links?.company ?? (undefined as unknown as null);
  const company =
    inlineCompany
      ? ({ name: inlineCompany.brandName?.trim() || inlineCompany.name?.trim() || undefined } as CompanyInfo)
      : job!.CompanyId
        ? companies[job!.CompanyId]
        : undefined;
  const jobsCity = mapLocation(job!.location, job!.country?.name) ?? (job!.links?.city ? job!.links.city.name ?? undefined : undefined);

  let timeline: PlatformStatusEvent[] | undefined;
  if (Array.isArray(raw.applicationStatusTracking)) {
    const events = raw.applicationStatusTracking
      .filter((e) => e?.status && e?.createdAt)
      .map((e) => ({
        status: String(e.status).toUpperCase(),
        at: new Date(e.createdAt as string),
        message: e.message ?? undefined,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (events.length) timeline = events;
  }

  return {
    externalId,
    jobExternalId: job!.id,
    appliedAt: new Date(raw.createdAt),
    platform: "Glints",
    platformStatus: (raw.status ?? "NEW").toUpperCase(),
    jobTitle: (job!.title ?? "").trim() || `Glints job ${job!.id.slice(0, 8)}`,
    // Brand name is what the user sees on Glints ("Migoz Group");
    // fall back to the legal entity name.
    companyName: company?.name ?? "Unknown Company",
    location: jobsCity ?? company?.location,
    employmentType: mapEmploymentType(job!.type),
    salary: formatSalary(job!.salaries ?? job!.links?.jobSalaries),
    jobUrl: glintsJobUrl(job!.id),
    timeline,
    // Job-posting signal the Glints UI renders as chips: "Loker Dihapus" /
    // "Tidak lagi menerima lamaran" (status CLOSED) and the moderation flag
    // (e.g. VERIFIED_SCAM_FRAUD = "indikasi penipuan"). The application
    // status itself is unchanged by these.
    jobClosed:
      String(job!.status ?? "").toUpperCase() === "CLOSED" || Boolean(job!.closedAt),
    jobClosedAt: job!.closedAt ? new Date(job!.closedAt) : null,
    jobFlag: job!.fraudReportFlag ?? null,
  };
}

function lastEventAt(timeline?: PlatformStatusEvent[]): number {
  return timeline?.length ? timeline[timeline.length - 1].at.getTime() : 0;
}

/**
 * Merge two views of the same application (e.g. one from the paged list,
 * one from a detail response). Views may be partial.
 */
function mergeCandidate(
  prev: PlatformApplicationCandidate,
  next: PlatformApplicationCandidate,
): PlatformApplicationCandidate {
  const prevAt = lastEventAt(prev.timeline);
  const nextAt = lastEventAt(next.timeline);

  const timeline = nextAt >= prevAt ? next.timeline : prev.timeline;
  const timelineStatus = timeline?.length ? timeline[timeline.length - 1].status : undefined;

  const platformStatus =
    timelineStatus ??
    ((GLINTS_STATUS_RANK[prev.platformStatus] ?? 0) > (GLINTS_STATUS_RANK[next.platformStatus] ?? 0)
      ? prev.platformStatus
      : next.platformStatus);

  return {
    externalId: prev.externalId,
    jobExternalId: prev.jobExternalId || next.jobExternalId,
    appliedAt: prev.appliedAt.getTime() <= next.appliedAt.getTime() ? prev.appliedAt : next.appliedAt,
    platform: "Glints",
    platformStatus,
    // Keep the richer job title (GraphQL gives exact casing, list may vary).
    jobTitle: next.jobTitle.length > prev.jobTitle.length ? next.jobTitle : prev.jobTitle,
    companyName: prev.companyName !== "Unknown Company" ? prev.companyName : next.companyName,
    location: prev.location ?? next.location,
    employmentType: prev.employmentType ?? next.employmentType,
    salary: prev.salary ?? next.salary,
    jobUrl: prev.jobUrl || next.jobUrl,
    timeline,
    // Either view may know about the posting being closed/flagged — union them.
    jobClosed: Boolean(prev.jobClosed) || Boolean(next.jobClosed),
    jobClosedAt: prev.jobClosedAt ?? next.jobClosedAt ?? null,
    jobFlag: prev.jobFlag ?? next.jobFlag ?? null,
  };
}

/**
 * Shared dedupe/merge collector for raw Glints application payloads, used by
 * both the HAR parser and the live-pull client.
 */
export function createGlintsAggregator() {
  const companies: CompanyLookup = {};
  const byId = new Map<string, GlintsApplicationCandidate>();
  let companiesSeen = 0;

  const agg = {
    get companiesFound() {
      return Object.keys(companies).length;
    },
    get candidates(): GlintsApplicationCandidate[] {
      return [...byId.values()].sort(
        (a, b) => b.appliedAt.getTime() - a.appliedAt.getTime(),
      );
    },

    /** Feed any raw JSON:API-style application list/rest/detail payload. */
    takeApplications(list: unknown) {
      if (!Array.isArray(list)) return;
      for (const raw of list as RawApplication[]) {
        if (!raw || !isUuid(raw.id)) continue;
        const next = normalizeApplication(raw, companies);
        if (!next) continue;
        const prev = byId.get(next.externalId);
        byId.set(next.externalId, prev ? mergeCandidate(prev, next) : next);
      }
    },

    /** Feed a /api/companies response for name & location enrichment. */
    absorbCompanies(json: unknown) {
      const before = agg.companiesFound;
      collectCompanies(json, companies);
      companiesSeen = Math.max(companiesSeen, agg.companiesFound - before);
    },
  };
  void companiesSeen;
  return agg;
}

export type GlintsAggregator = ReturnType<typeof createGlintsAggregator>;

/**
 * Parse a HAR (already JSON-parsed) into deduplicated candidates.
 * Details' status timelines override plain list statuses when available.
 */
export function extractGlintsCandidates(har: unknown): {
  candidates: GlintsApplicationCandidate[];
  companiesFound: number;
} {
  const entries = ((har as Har | null)?.log?.entries ?? []) as HarEntry[];
  const agg = createGlintsAggregator();

  // Classify first, then absorb in dependency order: /api/companies payloads
  // typically appear *after* the list entries that need them.
  const appLists: unknown[] = [];
  const details: unknown[] = [];

  for (const entry of entries) {
    const json = decodeEntry(entry) as
      | (ParsedJson & { getApplications?: { data?: unknown } })
      | undefined;
    if (!json) continue;

    const url = entry.request.url;
    const isDetail = /\/api\/me\/applications\/[0-9a-f-]{36}/i.test(url);
    const isCompanies = /\/api\/companies\b/i.test(url);
    const isList = url.includes("/api/me/applications") && !isDetail;
    const isGraphQL = url.includes("/api/graphql") && url.includes("getApplications");

    if (isCompanies) {
      agg.absorbCompanies(json);
    } else if (isGraphQL) {
      const graphQlBody = (json as { data?: { getApplications?: { data?: unknown } } }).data;
      appLists.push(graphQlBody?.getApplications?.data);
    } else if (isDetail) {
      details.push((json as ParsedJson)?.data);
    } else if (isList) {
      appLists.push((json as ParsedJson)?.data);
    }
  }

  for (const list of appLists) agg.takeApplications(list);
  for (const data of details) if (data) agg.takeApplications([data]);

  return { candidates: agg.candidates, companiesFound: agg.companiesFound };
}
