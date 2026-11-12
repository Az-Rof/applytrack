import "server-only";
import { Prisma, type ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CreateApplicationInput } from "@/lib/validation";

/** Normalize a URL for duplicate detection (drop tracking params & hash). */
function normalizeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const keep = new Set([
      "id",
      "jobid",
      "job_id",
      "jk",
      "jobid",
      "job",
      "positionid",
      "gh_jid",
      "currentjobid",
    ]);
    const clean = new URLSearchParams();
    url.searchParams.forEach((v, k) => {
      if (keep.has(k.toLowerCase()) || k.toLowerCase().startsWith("job")) {
        clean.set(k, v);
      }
    });
    const qs = clean.toString();
    return `${url.origin}${url.pathname}${qs ? `?${qs}` : ""}`.replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export type ListFilters = {
  platform?: string;
  status?: ApplicationStatus;
  company?: string;
  from?: string;
  to?: string;
  q?: string;
  take?: number;
  skip?: number;
};

export async function listApplications(userId: string, filters: ListFilters = {}) {
  const where: Prisma.ApplicationWhereInput = { userId, archived: false };

  if (filters.platform) where.platform = filters.platform;
  if (filters.status) where.status = filters.status;
  if (filters.company)
    where.companyName = { contains: filters.company, mode: "insensitive" };
  if (filters.q) {
    where.OR = [
      { jobTitle: { contains: filters.q, mode: "insensitive" } },
      { companyName: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.from || filters.to) {
    where.appliedAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { appliedAt: "desc" },
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    }),
    prisma.application.count({ where }),
  ]);

  return { items, total };
}

export async function getApplication(userId: string, id: string) {
  return prisma.application.findFirst({
    where: { id, userId },
    include: {
      statusHistory: { orderBy: { changedAt: "desc" } },
      reminders: { orderBy: { dueAt: "asc" } },
    },
  });
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput & { source?: "MANUAL" | "EXTENSION" },
) {
  const normalized = normalizeUrl(input.jobUrl);

  // Duplicate guard (US-002): same user + same normalized URL.
  if (normalized) {
    const existing = await prisma.application.findFirst({
      where: { userId, jobUrl: normalized },
    });
    if (existing) {
      return { application: existing, duplicate: true as const };
    }
  }

  const application = await prisma.application.create({
    data: {
      userId,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      platform: input.platform,
      location: input.location || null,
      jobUrl: normalized,
      employmentType: input.employmentType || null,
      salary: input.salary || null,
      notes: input.notes || null,
      appliedAt: input.appliedAt ?? new Date(),
      status: input.status ?? "APPLIED",
      source: input.source ?? "MANUAL",
      statusHistory: {
        create: {
          oldStatus: null,
          newStatus: input.status ?? "APPLIED",
          note: "Application created",
        },
      },
    },
  });

  return { application, duplicate: false as const };
}

export async function updateApplication(
  userId: string,
  id: string,
  data: Prisma.ApplicationUpdateInput,
) {
  const existing = await prisma.application.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.application.update({ where: { id }, data });
}

export async function changeStatus(
  userId: string,
  id: string,
  status: ApplicationStatus,
  note?: string,
) {
  const existing = await prisma.application.findFirst({ where: { id, userId } });
  if (!existing) return null;
  if (existing.status === status) return existing;

  const [updated] = await prisma.$transaction([
    prisma.application.update({
      where: { id },
      data: {
        status,
        lastStatusChangeAt: new Date(),
      },
    }),
    prisma.statusHistory.create({
      data: {
        applicationId: id,
        oldStatus: existing.status,
        newStatus: status,
        note: note || null,
      },
    }),
  ]);

  return updated;
}

export async function deleteApplication(userId: string, id: string) {
  const existing = await prisma.application.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await prisma.application.delete({ where: { id } });
  return true;
}
