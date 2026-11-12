import "server-only";

import { prisma } from "@/lib/prisma";
import type { ApplicationStatus } from "@/lib/status";

/**
 * Auto-reject rule (user-configurable).
 *
 * Applications that are still "in progress" but have not seen ANY status
 * change — neither from the user nor from a platform sync — for more than
 * `autoRejectDays` days are automatically marked REJECTED, with a history
 * entry explaining why. OFFER and beyond are never auto-rejected.
 */
export const AUTO_REJECT_NOTE_PREFIX = "Auto-rejected:";

/** Statuses that may be auto-rejected (offer/beyond are excluded). */
const AUTO_REJECTABLE: ApplicationStatus[] = [
  "APPLIED",
  "HR_SCREENING",
  "INTERVIEW",
  "TECHNICAL_TEST",
  "USER_INTERVIEW",
];

const DAY_MS = 24 * 60 * 60 * 1000;

export type AutoRejectResult = {
  /** Configured threshold; null = rule disabled. */
  days: number | null;
  /** How many applications were flipped to Rejected in this run. */
  rejected: number;
};

export async function getAutoRejectDays(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoRejectDays: true },
  });
  return user?.autoRejectDays ?? null;
}

export async function setAutoRejectDays(
  userId: string,
  days: number | null,
): Promise<number | null> {
  const value =
    days === null || days === undefined ? null : Math.min(Math.max(Math.trunc(days), 1), 365);
  await prisma.user.update({ where: { id: userId }, data: { autoRejectDays: value } });
  return value;
}

/**
 * Flip every stale in-progress application of the user to REJECTED.
 * "Stale" = `lastStatusChangeAt` (application's own last movement) older than
 * the configured days. Safe to run repeatedly — REJECTED rows are not
 * re-processed, so repeats are no-ops.
 */
export async function applyAutoReject(
  userId: string,
  now: Date = new Date(),
): Promise<AutoRejectResult> {
  const days = await getAutoRejectDays(userId);
  if (!days) return { days: null, rejected: 0 };

  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const stale = await prisma.application.findMany({
    where: {
      userId,
      archived: false,
      status: { in: AUTO_REJECTABLE },
      lastStatusChangeAt: { lt: cutoff },
    },
    select: { id: true, status: true, jobTitle: true, companyName: true },
  });

  for (const row of stale) {
    const note = `${AUTO_REJECT_NOTE_PREFIX} no status change for ${days} days (since ${cutoff
      .toISOString()
      .slice(0, 10)}) — ${row.jobTitle} @ ${row.companyName}`;
    await prisma.$transaction([
      prisma.statusHistory.create({
        data: {
          applicationId: row.id,
          oldStatus: row.status,
          newStatus: "REJECTED",
          note,
          changedAt: now,
        },
      }),
      prisma.application.update({
        where: { id: row.id },
        data: { status: "REJECTED", lastStatusChangeAt: now },
      }),
    ]);
  }

  return { days, rejected: stale.length };
}
