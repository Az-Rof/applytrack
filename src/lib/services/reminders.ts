import "server-only";
import { prisma } from "@/lib/prisma";

const DEFAULT_FOLLOW_UP_DAYS = 14;

/**
 * Creates a follow-up reminder for every active application that has had no
 * status update for N days and doesn't already have a pending reminder.
 * Intended to be called from a cron job / route handler.
 */
export async function generateFollowUpReminders(
  userId: string,
  days = DEFAULT_FOLLOW_UP_DAYS,
) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const stale = await prisma.application.findMany({
    where: {
      userId,
      archived: false,
      status: { notIn: ["ACCEPTED", "REJECTED", "WITHDRAWN"] },
      lastStatusChangeAt: { lt: cutoff },
      reminders: { none: { status: "PENDING" } },
    },
  });

  if (!stale.length) return [];

  await prisma.reminder.createMany({
    data: stale.map((app) => ({
      applicationId: app.id,
      type: "FOLLOW_UP" as const,
      dueAt: new Date(),
      message: `No update from ${app.companyName} for ${app.jobTitle} in ${days}+ days. Consider following up with the recruiter.`,
    })),
  });

  return stale;
}

export async function listReminders(userId: string) {
  return prisma.reminder.findMany({
    where: { application: { userId } },
    include: {
      application: {
        select: { id: true, jobTitle: true, companyName: true, platform: true },
      },
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });
}

export async function resolveReminder(
  userId: string,
  id: string,
  status: "DONE" | "DISMISSED",
) {
  const reminder = await prisma.reminder.findFirst({
    where: { id, application: { userId } },
  });
  if (!reminder) return null;
  return prisma.reminder.update({
    where: { id },
    data: { status, resolvedAt: new Date() },
  });
}
