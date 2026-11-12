import "server-only";
import { prisma } from "@/lib/prisma";
import {
  INTERVIEW_STAGE_STATUSES,
  OFFER_STAGE_STATUSES,
  STATUS_LABEL,
  STATUS_PIPELINE,
  type ApplicationStatus,
} from "@/lib/status";

export type DashboardMetrics = {
  totalApplications: number;
  totalInterviews: number;
  totalTechnicalTests: number;
  totalOffers: number;
  totalRejections: number;
  interviewRate: number;
  offerRate: number;
  responseRate: number;
  activeApplications: number;
  thisMonthApplications: number;
  lastMonthApplications: number;
};

export async function getMetrics(userId: string): Promise<DashboardMetrics> {
  const apps = await prisma.application.findMany({
    where: { userId, archived: false },
    select: { status: true, appliedAt: true },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const total = apps.length;
  const interviews = apps.filter((a) =>
    INTERVIEW_STAGE_STATUSES.includes(a.status),
  ).length;
  const tests = apps.filter((a) => a.status === "TECHNICAL_TEST").length;
  const offers = apps.filter((a) => OFFER_STAGE_STATUSES.includes(a.status)).length;
  const rejections = apps.filter((a) => a.status === "REJECTED").length;
  const responded = apps.filter((a) => a.status !== "APPLIED").length;

  return {
    totalApplications: total,
    totalInterviews: interviews,
    totalTechnicalTests: tests,
    totalOffers: offers,
    totalRejections: rejections,
    interviewRate: total ? interviews / total : 0,
    offerRate: total ? offers / total : 0,
    responseRate: total ? responded / total : 0,
    activeApplications: apps.filter(
      (a) => !["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(a.status),
    ).length,
    thisMonthApplications: apps.filter((a) => a.appliedAt >= monthStart).length,
    lastMonthApplications: apps.filter(
      (a) => a.appliedAt >= lastMonthStart && a.appliedAt < monthStart,
    ).length,
  };
}

export type PlatformPerformance = {
  platform: string;
  applications: number;
  interviews: number;
  offers: number;
  rejections: number;
  interviewRate: number;
  offerRate: number;
};

export async function getPlatformPerformance(
  userId: string,
): Promise<PlatformPerformance[]> {
  const grouped = await prisma.application.groupBy({
    by: ["platform", "status"],
    where: { userId, archived: false },
    _count: true,
  });

  const map = new Map<string, PlatformPerformance>();
  for (const row of grouped) {
    const entry =
      map.get(row.platform) ??
      ({
        platform: row.platform,
        applications: 0,
        interviews: 0,
        offers: 0,
        rejections: 0,
        interviewRate: 0,
        offerRate: 0,
      } satisfies PlatformPerformance);

    entry.applications += row._count;
    if (INTERVIEW_STAGE_STATUSES.includes(row.status as ApplicationStatus))
      entry.interviews += row._count;
    if (OFFER_STAGE_STATUSES.includes(row.status as ApplicationStatus))
      entry.offers += row._count;
    if (row.status === "REJECTED") entry.rejections += row._count;
    map.set(row.platform, entry);
  }

  return [...map.values()]
    .map((p) => ({
      ...p,
      interviewRate: p.applications ? p.interviews / p.applications : 0,
      offerRate: p.applications ? p.offers / p.applications : 0,
    }))
    .sort((a, b) => b.applications - a.applications);
}

export type MonthlyPoint = { month: string; applications: number; interviews: number };

export async function getApplicationsPerMonth(
  userId: string,
  months = 6,
): Promise<MonthlyPoint[]> {
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1));
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const apps = await prisma.application.findMany({
    where: { userId, archived: false, appliedAt: { gte: start } },
    select: { appliedAt: true, status: true },
  });

  const buckets: MonthlyPoint[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    buckets.push({
      month: d.toLocaleString("en-GB", { month: "short", year: "2-digit" }),
      applications: 0,
      interviews: 0,
    });
  }

  for (const app of apps) {
    const diff =
      (app.appliedAt.getFullYear() - start.getFullYear()) * 12 +
      (app.appliedAt.getMonth() - start.getMonth());
    if (diff >= 0 && diff < months) {
      buckets[diff].applications += 1;
      if (INTERVIEW_STAGE_STATUSES.includes(app.status)) buckets[diff].interviews += 1;
    }
  }

  return buckets;
}

export type FunnelStage = {
  stage: string;
  label: string;
  count: number;
  rate: number;
};

/**
 * Counts how many applications have ever *reached* each pipeline stage,
 * using both current status and status history (so an application that
 * moved past a stage still counts for it).
 */
export async function getConversionFunnel(userId: string): Promise<FunnelStage[]> {
  const apps = await prisma.application.findMany({
    where: { userId, archived: false },
    include: { statusHistory: { select: { newStatus: true } } },
  });

  const reached = new Map<ApplicationStatus, number>();
  for (const stage of STATUS_PIPELINE) reached.set(stage, 0);

  for (const app of apps) {
    const seen = new Set<ApplicationStatus>();
    for (const h of app.statusHistory) seen.add(h.newStatus as ApplicationStatus);
    seen.add(app.status);
    for (const s of seen) {
      if (reached.has(s)) reached.set(s, (reached.get(s) ?? 0) + 1);
    }
  }

  const total = apps.length || 1;
  return STATUS_PIPELINE.map((stage) => {
    const count = reached.get(stage) ?? 0;
    return {
      stage,
      label: STATUS_LABEL[stage],
      count,
      rate: count / total,
    };
  });
}

export async function getStatusDistribution(userId: string) {
  const grouped = await prisma.application.groupBy({
    by: ["status"],
    where: { userId, archived: false },
    _count: true,
  });
  return grouped.map((g) => ({
    status: g.status,
    label: STATUS_LABEL[g.status as ApplicationStatus],
    count: g._count,
  }));
}
