/**
 * Platform-agnostic candidate model shared by every import/sync source
 * (Glints HAR + live pull, JobStreet HAR + live pull).
 *
 * A "candidate" is one submitted application as the *platform* sees it —
 * raw statuses are kept verbatim (e.g. Glints `IN_REVIEW`, JobStreet
 * `NotSuitable`) and mapped to ApplyTrack's canonical statuses here.
 */

import type { ApplicationStatus } from "@/lib/status";

export type PlatformName = "Glints" | "JobStreet";

/** One entry of a platform's status timeline. */
export type PlatformStatusEvent = {
  /** Raw status as the platform spells it, e.g. "IN_REVIEW" | "NotSuitable". */
  status: string;
  at: Date;
  message?: string;
};

/** Normalized application candidate ready for the sync service. */
export type PlatformApplicationCandidate = {
  /** Which platform the data came from — persisted on the Application row. */
  platform: PlatformName;
  /** Application ID on the platform (stable across re-syncs). */
  externalId: string;
  /** Job/posting ID on the platform — key for canonical URL + matching. */
  jobExternalId: string;
  appliedAt: Date;
  /** Latest raw platform status, e.g. "NEW" | "IN_REVIEW" | "NotSuitable". */
  platformStatus: string;
  jobTitle: string;
  companyName: string;
  location?: string;
  employmentType?: string;
  salary?: string;
  jobUrl: string;
  timeline?: PlatformStatusEvent[];
  /** Mirrored job-posting state (independent of the application status). */
  jobClosed?: boolean;
  jobClosedAt?: Date | null;
  /** Raw platform moderation flag, e.g. Glints "VERIFIED_SCAM_FRAUD". */
  jobFlag?: string | null;
};

/** Status key normalized for lookup: uppercase, punctuation removed. */
function statusKey(raw?: string | null): string {
  return (raw ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/* ------------------------------------------------- status / value mapping */

/**
 * Glints application status enum (extracted from the glints.com JS bundle):
 * NEW | IN_REVIEW | ASSESSMENT | INTERVIEWING | OFFERED | HIRED | REJECTED.
 * Keys are normalized (punctuation-free uppercase).
 */
export const GLINTS_STATUS_MAP: Record<string, ApplicationStatus> = {
  NEW: "APPLIED",
  INREVIEW: "HR_SCREENING",
  ASSESSMENT: "TECHNICAL_TEST",
  INTERVIEWING: "INTERVIEW",
  OFFERED: "OFFER",
  HIRED: "ACCEPTED",
  REJECTED: "REJECTED",
};

/**
 * JobStreet (SEEK Indonesia) applied-job event statuses. Only "Applied" and
 * "NotSuitable" are confirmed from real captures; the others are defensive
 * mappings for the rest of SEEK's application lifecycle. Anything unknown
 * stays at APPLIED (the raw status is preserved in the history note).
 */
export const JOBSTREET_STATUS_MAP: Record<string, ApplicationStatus> = {
  APPLIED: "APPLIED",
  VIEWED: "HR_SCREENING",
  VIEWEDBYHIRER: "HR_SCREENING",
  INREVIEW: "HR_SCREENING",
  SCREENING: "HR_SCREENING",
  SCREENED: "HR_SCREENING",
  SHORTLISTED: "HR_SCREENING",
  ASSESSMENT: "TECHNICAL_TEST",
  ASSESSMENTCENTER: "TECHNICAL_TEST",
  TECHNICALTEST: "TECHNICAL_TEST",
  INTERVIEW: "INTERVIEW",
  INTERVIEWING: "INTERVIEW",
  USERINTERVIEW: "USER_INTERVIEW",
  OFFER: "OFFER",
  OFFERMADE: "OFFER",
  OFFERED: "OFFER",
  PLACED: "ACCEPTED",
  HIRED: "ACCEPTED",
  SUCCESSFUL: "ACCEPTED",
  NOTSUITABLE: "REJECTED",
  UNSUCCESSFUL: "REJECTED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
  WITHDRAWNBYCANDIDATE: "WITHDRAWN",
  DECLINEDBYCANDIDATE: "WITHDRAWN",
};

const STATUS_MAPS: Record<PlatformName, Record<string, ApplicationStatus>> = {
  Glints: GLINTS_STATUS_MAP,
  JobStreet: JOBSTREET_STATUS_MAP,
};

/**
 * Map a raw platform status to ApplyTrack's canonical status.
 * Unknown statuses stay at APPLIED — the raw status is kept in history notes.
 */
export function mapPlatformStatus(
  platform: PlatformName,
  raw?: string | null,
): ApplicationStatus {
  const mapped = STATUS_MAPS[platform][statusKey(raw)];
  return mapped ?? "APPLIED";
}

/** Human label of the platform for UI copy ("Glints"/"JobStreet"). */
export function platformLabel(p: PlatformName): string {
  return p;
}
