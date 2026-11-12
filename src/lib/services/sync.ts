import "server-only";

import { Prisma, type Application } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ApplicationStatus } from "@/lib/status";
import {
  mapPlatformStatus,
  type PlatformApplicationCandidate,
  type PlatformStatusEvent,
} from "@/lib/import/platform";
import { AUTO_REJECT_NOTE_PREFIX } from "@/lib/services/auto-reject";

export type SyncConflict = {
  externalId: string;
  platform: string;
  jobTitle: string;
  companyName: string;
  /** What the platform says the application is at, e.g. "REJECTED"/"NotSuitable". */
  platformStatus: string;
  /** Status currently stored locally (kept because source = MANUAL). */
  localStatus: string;
  /** Why the local status won: the user created the row, or the auto-reject rule. */
  reason?: "manual" | "auto-reject";
};

export type SyncSummary = {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicts: SyncConflict[];
};

type HistoryStep = {
  oldStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus;
  at: Date;
  note: string;
};

function eventNote(
  platform: PlatformApplicationCandidate["platform"],
  event?: PlatformStatusEvent,
): string | undefined {
  if (!event) return undefined;
  const raw = ` [${event.status}]`;
  return event.message?.trim()
    ? `${event.message.trim()}${raw}`
    : `Synced from ${platform}${raw}`;
}

/** Turn a platform status timeline into canonical history steps. */
function timelineSteps(candidate: PlatformApplicationCandidate): HistoryStep[] {
  if (!candidate.timeline?.length) {
    return [
      {
        oldStatus: null,
        newStatus: mapPlatformStatus(candidate.platform, candidate.platformStatus),
        at: candidate.appliedAt,
        note: `Synced from ${candidate.platform} [${candidate.platformStatus}]`,
      },
    ];
  }

  const sorted = [...candidate.timeline].sort((a, b) => a.at.getTime() - b.at.getTime());
  const steps: HistoryStep[] = [];

  for (const event of sorted) {
    const status = mapPlatformStatus(candidate.platform, event.status);
    const last = steps[steps.length - 1];

    if (last && last.newStatus === status) {
      // Same state twice: keep the newer date/message.
      if (event.at >= last.at) {
        last.at = event.at;
        last.note = eventNote(candidate.platform, event) ?? last.note;
      }
      continue;
    }

    steps.push({
      oldStatus: last ? last.newStatus : null,
      newStatus: status,
      at: event.at,
      note: eventNote(candidate.platform, event) ?? `Synced from ${candidate.platform} [${event.status}]`,
    });
  }
  return steps;
}

/** An existing row loaded together with its newest history entry. */
type ExistingApplication = Prisma.ApplicationGetPayload<{
  include: {
    statusHistory: {
      orderBy: { changedAt: "desc" };
      take: 1;
      select: { note: true; changedAt: true };
    };
  };
}>;

async function findExisting(
  userId: string,
  candidate: PlatformApplicationCandidate,
): Promise<ExistingApplication | null> {
  const byExternalId = await prisma.application.findFirst({
    where: { userId, platform: candidate.platform, externalId: candidate.externalId },
    include: {
      statusHistory: { orderBy: { changedAt: "desc" }, take: 1, select: { note: true, changedAt: true } },
    },
  });
  if (byExternalId) return byExternalId;

  // Cross-source fallback: the Chrome extension may have captured the same
  // job under its real page URL — the Glints job UUID appears in Glints URLs.
  const byUrlFragment = await prisma.application.findFirst({
    where: {
      userId,
      jobUrl: { contains: candidate.jobExternalId },
    },
    include: {
      statusHistory: { orderBy: { changedAt: "desc" }, take: 1, select: { note: true, changedAt: true } },
    },
  });
  if (byUrlFragment) return byUrlFragment;

  // Same canonical URL already imported.
  return prisma.application
    .findFirst({
      where: { userId, jobUrl: candidate.jobUrl },
      include: {
        statusHistory: { orderBy: { changedAt: "desc" }, take: 1, select: { note: true, changedAt: true } },
      },
    })
    .catch(() => null);
}

async function createImportedApplication(
  userId: string,
  candidate: PlatformApplicationCandidate,
): Promise<Application> {
  const steps = timelineSteps(candidate);
  const last = steps[steps.length - 1];

  return prisma.application.create({
    data: {
      userId,
      jobTitle: candidate.jobTitle.slice(0, 200),
      companyName: candidate.companyName.slice(0, 200),
      platform: candidate.platform,
      location: candidate.location?.slice(0, 200) ?? null,
      jobUrl: candidate.jobUrl,
      employmentType: candidate.employmentType ?? null,
      salary: candidate.salary ?? null,
      appliedAt: candidate.appliedAt,
      status: last.newStatus,
      source: "IMPORT",
      externalId: candidate.externalId,
      jobClosed: candidate.jobClosed ?? false,
      jobClosedAt: candidate.jobClosedAt ?? null,
      jobFlag: candidate.jobFlag ?? null,
      lastStatusChangeAt: last.at,
      statusHistory: {
        create: steps.map((step) => ({
          oldStatus: step.oldStatus,
          newStatus: step.newStatus,
          note: step.note,
          changedAt: step.at,
        })),
      },
    },
  });
}

type UpdateOutcome = { changed: boolean; conflict?: SyncConflict };

/**
 * Refresh an already-known application.
 *
 * AUTO-sourced rows (EXTENSION/IMPORT) get status + history updates from
 * Glints; rows created manually (MANUAL) are only enriched with missing
 * fields, and status differences are reported — never overwritten.
 */
async function updateExistingApplication(
  existing: ExistingApplication,
  candidate: PlatformApplicationCandidate,
): Promise<UpdateOutcome> {
  const steps = timelineSteps(candidate);
  const last = steps[steps.length - 1];
  const targetStatus = last.newStatus;
  const statusDiffers = existing.status !== targetStatus;

  let changed = false;
  const data: Prisma.ApplicationUpdateInput = {};

  // Fill gaps; never overwrite user-provided values with candidates' values.
  if (!existing.location && candidate.location) {
    data.location = candidate.location.slice(0, 200);
    changed = true;
  }
  if (!existing.employmentType && candidate.employmentType) {
    data.employmentType = candidate.employmentType;
    changed = true;
  }
  if (!existing.salary && candidate.salary) {
    data.salary = candidate.salary;
    changed = true;
  }
  if (!existing.externalId) {
    data.externalId = candidate.externalId;
    changed = true;
  }

  // Job-posting-level signal (posting closed / moderation flag) mirrors the
  // platform for every row — MANUAL rows included. It never touches the
  // application status, so it is safe to overwrite in both directions
  // (closed ⇒ re-opened clears it again).
  const jobClosed = candidate.jobClosed ?? false;
  const jobClosedAt = candidate.jobClosedAt ?? null;
  const jobFlag = candidate.jobFlag ?? null;
  if (
    existing.jobClosed !== jobClosed ||
    existing.jobClosedAt?.getTime() !== jobClosedAt?.getTime() ||
    existing.jobFlag !== jobFlag
  ) {
    data.jobClosed = jobClosed;
    data.jobClosedAt = jobClosedAt;
    data.jobFlag = jobFlag;
    changed = true;
  }

  // Status agrees with Glints: persist any gap-fills and stop.
  if (!statusDiffers) {
    if (changed) {
      await prisma.application.update({ where: { id: existing.id }, data });
    }
    return { changed };
  }

  // User-created rows keep their own story: fill the gaps, but report the
  // platform status difference instead of overwriting the status.
  if (existing.source === "MANUAL") {
    if (changed) {
      await prisma.application.update({ where: { id: existing.id }, data });
    }
    return {
      changed,
      conflict: {
        externalId: candidate.externalId,
        platform: candidate.platform,
        jobTitle: candidate.jobTitle,
        companyName: candidate.companyName,
        platformStatus: candidate.platformStatus,
        localStatus: existing.status,
        reason: "manual",
      },
    };
  }

  // An auto-rejected row stays Rejected unless the platform itself recorded a
  // *newer* event after the auto-rejection (real progress beats the rule).
  // Otherwise the next sync would resurrect it and ping-pong forever.
  const latestHistory = existing.statusHistory[0];
  const autoRejected =
    existing.status === "REJECTED" &&
    Boolean(latestHistory?.note?.startsWith(AUTO_REJECT_NOTE_PREFIX)) &&
    last.at <= (latestHistory?.changedAt ?? new Date(0));
  if (autoRejected && statusDiffers) {
    if (changed) {
      await prisma.application.update({ where: { id: existing.id }, data });
    }
    return {
      changed,
      conflict: {
        externalId: candidate.externalId,
        platform: candidate.platform,
        jobTitle: candidate.jobTitle,
        companyName: candidate.companyName,
        platformStatus: candidate.platformStatus,
        localStatus: existing.status,
        reason: "auto-reject",
      },
    };
  }

  data.status = targetStatus;
  // Never move lastStatusChangeAt backwards relative to local events.
  data.lastStatusChangeAt =
    last.at > existing.lastStatusChangeAt ? last.at : existing.lastStatusChangeAt;
  const historyNote = last.note;
  const historyAt = data.lastStatusChangeAt as Date;

  await prisma.$transaction([
    prisma.application.update({ where: { id: existing.id }, data }),
    prisma.statusHistory.create({
      data: {
        applicationId: existing.id,
        oldStatus: existing.status,
        newStatus: targetStatus,
        note: historyNote,
        changedAt: historyAt,
      },
    }),
  ]);

  return { changed: true };
}

/**
 * Import/refresh applications synced from Glints. Idempotent: running it
 * twice must not duplicate rows nor
 * rewrite unchanged history.
 */
export async function syncApplications(
  userId: string,
  candidates: PlatformApplicationCandidate[],
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    scanned: candidates.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    conflicts: [],
  };

  for (const candidate of candidates) {
    const existing = await findExisting(userId, candidate);

    if (existing) {
      const outcome = await updateExistingApplication(existing, candidate);
      if (outcome.conflict) summary.conflicts.push(outcome.conflict);
      if (outcome.changed) summary.updated += 1;
      else summary.unchanged += 1;
      continue;
    }

    try {
      await createImportedApplication(userId, candidate);
      summary.created += 1;
    } catch (err) {
      // Possible unique-constraint race (same URL imported twice in
      // parallel): fall back to an update when the row now exists.
      const retry = await findExisting(userId, candidate);
      if (retry) {
        const outcome = await updateExistingApplication(retry, candidate);
        if (outcome.conflict) summary.conflicts.push(outcome.conflict);
        if (outcome.changed) summary.updated += 1;
        else summary.unchanged += 1;
      } else {
        throw err;
      }
    }
  }

  return summary;
}

/* ------------------------------------------------------------- API result */

/** Row shape returned to the web UI by every sync endpoint. */
export type ImportedRow = {
  externalId: string;
  platform: string;
  jobTitle: string;
  companyName: string;
  /** Raw platform status, e.g. "NEW" | "IN_REVIEW" | "NotSuitable". */
  platformStatus: string;
  location: string | null;
  appliedAt: string;
  jobUrl: string;
  timelineSteps: number;
  jobClosed: boolean;
  jobFlag: string | null;
};

/** Map candidates into the shared response shape used by all sync routes. */
export function summarizeCandidates(
  candidates: PlatformApplicationCandidate[],
): ImportedRow[] {
  return candidates.map((c) => ({
    externalId: c.externalId,
    platform: c.platform,
    jobTitle: c.jobTitle,
    companyName: c.companyName,
    platformStatus: c.platformStatus,
    location: c.location ?? null,
    appliedAt: c.appliedAt.toISOString(),
    jobUrl: c.jobUrl,
    timelineSteps: c.timeline?.length ?? 0,
    jobClosed: c.jobClosed ?? false,
    jobFlag: c.jobFlag ?? null,
  }));
}
