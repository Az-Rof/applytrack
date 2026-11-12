/**
 * JobStreet live-pull: fetches *all* of the signed-in user's submitted jobs
 * (not just what a HAR happens to capture) with the session cookie pasted
 * once in the UI (DevTools → any jobstreet request → Cookie header).
 *
 * Unlike Glints, JobStreet does NOT block server-side requests: POSTing the
 * same `GetAppliedJobs` graphql operation the "My activity" page uses works
 * from the server — with a garbage cookie the endpoint answers HTTP 200 with
 * `extensions.code: "UNAUTHENTICATED"` instead of a block page.
 */

import {
  absorbAppliedJobsResponse,
  type RawAppliedJobNode,
} from "@/lib/import/jobstreet";
import type { PlatformApplicationCandidate } from "@/lib/import/platform";

export class JobStreetAuthError extends Error {
  readonly name = "JobStreetAuthError";
  constructor(
    message = "JobStreet session cookie is missing or expired — log in to id.jobstreet.com, copy the Cookie header, and connect again in /sync",
  ) {
    super(message);
  }
}

export type JobStreetSession = {
  cookie: string;
  userAgent?: string;
  /** id.jobstreet.com by default; other SEEK locales may also serve this API. */
  origin: string;
};

/** Request verbatim from the "applied-jobs" page capture — proven payload. */
const GET_APPLIED_JOBS_QUERY = `query GetAppliedJobs($first: Int, $locale: Locale!, $timezone: Timezone!, $zone: Zone!, $languageCode: LanguageCodeIso!, $showStrongInterestEndState: Boolean!, $selectedAnswerUris: [String!]!, $sortBy: AppliedJobSortByInput) {
  viewer {
    id
    appliedJobs(first: $first, locale: $locale, sortBy: $sortBy) {
      edges {
        node {
          id
          hasAppliedWithResume
          hasAppliedWithCoverLetter
          isExternal
          isPreferredApplicationEligible
          isPreferredApplication
          preferredApplicationMarkedAt {
            dateTimeUtc
            shortAbsoluteLabel(timezone: $timezone, locale: $locale)
            __typename
          }
          priorityApplyState {
            state
            updatedAt {
              dateTimeUtc
              shortAbsoluteLabel(timezone: $timezone, locale: $locale)
              __typename
            }
            __typename
          }
          applicationRequestId
          isActive
          notes
          events {
            status
            timestamp {
              dateTimeUtc
              shortAbsoluteLabel(timezone: $timezone, locale: $locale)
              __typename
            }
            __typename
          }
          appliedAt {
            dateTimeUtc
            shortAbsoluteLabel(timezone: $timezone, locale: $locale)
            __typename
          }
          job {
            id
            title
            location {
              label(locale: $locale, type: SHORT)
              __typename
            }
            abstract
            listedAt {
              dateTimeUtc
              label(context: JOB_POSTED, length: SHORT, timezone: $timezone, locale: $locale)
              __typename
            }
            advertiser {
              id
              name(locale: $locale)
              __typename
            }
            salary {
              label
              currencyLabel(zone: $zone)
              __typename
            }
            products {
              branding {
                logo {
                  url
                  __typename
                }
                __typename
              }
              __typename
            }
            tracking {
              hasRoleRequirements
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    verificationNudges(
      jobId: ""
      selectedAnswerUris: $selectedAnswerUris
      platform: WEB
      source: JAS
      zone: $zone
    ) {
      uri
      ctaLabel
      ctaUrl
      description
      rank
      verificationType
      __typename
    }
    __typename
  }
  priorityApplyCredit {
    ...PriorityApplyCreditFragment
    creditConfig {
      creditValue
      renewFrequency {
        value
        unit
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment PriorityApplyCreditFragment on PriorityApplyCredit {
  credit2(zone: $zone, languageCode: $languageCode) @include(if: $showStrongInterestEndState) {
    ... on PrioritizedCredit {
      remainingCount
      totalCredit
      nextRenewalDate {
        dateTimeUtc
        shortAbsoluteLabel(timezone: $timezone, locale: $locale)
        __typename
      }
      __typename
    }
    ... on PendingCredit {
      remainingCount
      totalCredit
      nextRenewalDate {
        dateTimeUtc
        shortAbsoluteLabel(timezone: $timezone, locale: $locale)
        __typename
      }
      __typename
    }
  }
  __typename
}`;

function requestBody(session: JobStreetSession, first: number): string {
  return JSON.stringify({
    operationName: "GetAppliedJobs",
    variables: {
      first,
      locale: "id-ID",
      timezone: "Asia/Jakarta",
      zone: "asia-4",
      languageCode: "id",
      showStrongInterestEndState: true,
      selectedAnswerUris: [],
      sortBy: { applicationDate: "DESC" },
    },
    extensions: { clientLibrary: { name: "@apollo/client", version: "4.2.6" } },
    query: GET_APPLIED_JOBS_QUERY,
  });
}

function headersFor(session: JobStreetSession): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/graphql-response+json, application/json",
    cookie: session.cookie,
    referer: `${session.origin}/id/my-activity/applied-jobs`,
    "user-agent":
      session.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  };
}

function isUnauthenticated(json: unknown): boolean {
  const errors = (json as { errors?: Array<{ extensions?: { code?: string } }> })?.errors;
  return Array.isArray(errors) && errors.some((e) => e?.extensions?.code === "UNAUTHENTICATED");
}

async function postGraphql(
  session: JobStreetSession,
  first: number,
): Promise<unknown | undefined> {
  let res: Response;
  try {
    res = await fetch(`${session.origin}/graphql`, {
      method: "POST",
      headers: headersFor(session),
      body: requestBody(session, first),
      redirect: "error",
    });
  } catch (err) {
    throw new Error(`Could not reach JobStreet: ${String(err)}`);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new JobStreetAuthError();
    throw new Error(`JobStreet API returned HTTP ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("JobStreet returned a non-JSON response (logged out?)");
  }
  if (json && typeof json === "object" && isUnauthenticated(json)) {
    throw new JobStreetAuthError();
  }
  return json;
}

/**
 * Cheap "is this cookie still usable?" probe — a single 1-item GetAppliedJobs.
 * Used before saving a connection and when diagnosing it.
 */
export async function checkJobStreetSession(session: JobStreetSession): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    await postGraphql(session, 1);
  } catch (err) {
    if (err instanceof JobStreetAuthError) {
      return { valid: false, error: "JobStreet rejected this cookie (expired or invalid session)" };
    }
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { valid: true };
}

/** Read `data.viewer.appliedJobs.edges[].node` rows out of a response. */
function appliedJobNodes(json: unknown): RawAppliedJobNode[] {
  const edges = (
    json as {
      data?: { viewer?: { appliedJobs?: { edges?: Array<{ node?: RawAppliedJobNode }> } } };
    }
  )?.data?.viewer?.appliedJobs?.edges;
  return Array.isArray(edges) ? edges.map((e) => e?.node).filter((n): n is RawAppliedJobNode => Boolean(n)) : [];
}

export type JobStreetPullResult = {
  candidates: PlatformApplicationCandidate[];
  counts: { list: number };
};

/**
 * Pull every submitted application (first page = 100, same as the website)
 * incl. full status timelines, ready for the sync service.
 */
export async function pullJobStreetApplications(
  session: JobStreetSession,
): Promise<JobStreetPullResult> {
  const json = await postGraphql(session, 100);
  const nodes = appliedJobNodes(json);

  const byId = new Map<string, PlatformApplicationCandidate>();
  for (const node of nodes) {
    absorbAppliedJobNode(node, byId);
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.appliedAt.getTime() - a.appliedAt.getTime(),
  );
  return { candidates, counts: { list: nodes.length } };
}

/** Same merge semantics as `absorbAppliedJobsResponse`, but for single nodes. */
function absorbAppliedJobNode(
  node: RawAppliedJobNode,
  into: Map<string, PlatformApplicationCandidate>,
): void {
  absorbAppliedJobsResponse({ data: { viewer: { appliedJobs: { edges: [{ node }] } } } }, into);
}
