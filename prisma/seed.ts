import { PrismaClient, type ApplicationStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

export const DEMO_EMAIL = "demo@applytrack.dev";
export const DEMO_PASSWORD = "demo12345";

const prisma = new PrismaClient();

const PIPELINE: ApplicationStatus[] = [
  "APPLIED",
  "HR_SCREENING",
  "INTERVIEW",
  "TECHNICAL_TEST",
  "USER_INTERVIEW",
  "OFFER",
  "ACCEPTED",
];

type Seed = {
  jobTitle: string;
  companyName: string;
  platform: string;
  location: string;
  daysAgo: number;
  status: ApplicationStatus;
  url: string;
};

const SEEDS: Seed[] = [
  { jobTitle: "Data Analyst", companyName: "ABC Corp", platform: "Glints", location: "Jakarta", daysAgo: 3, status: "APPLIED", url: "https://glints.com/id/opportunities/jobs/seed-1" },
  { jobTitle: "Business Intelligence Analyst", companyName: "PT XYZ", platform: "JobStreet", location: "Jakarta", daysAgo: 8, status: "HR_SCREENING", url: "https://jobstreet.co.id/job/seed-2" },
  { jobTitle: "Data Engineer", companyName: "Tokopedia", platform: "LinkedIn", location: "Jakarta", daysAgo: 14, status: "INTERVIEW", url: "https://linkedin.com/jobs/seed-3" },
  { jobTitle: "Product Analyst", companyName: "Gojek", platform: "Kalibrr", location: "Jakarta", daysAgo: 18, status: "TECHNICAL_TEST", url: "https://kalibrr.com/jobs/seed-4" },
  { jobTitle: "Analytics Engineer", companyName: "Traveloka", platform: "LinkedIn", location: "Tangerang", daysAgo: 25, status: "OFFER", url: "https://linkedin.com/jobs/seed-5" },
  { jobTitle: "Junior Data Scientist", companyName: "Bukalapak", platform: "Glints", location: "Remote", daysAgo: 30, status: "REJECTED", url: "https://glints.com/id/opportunities/jobs/seed-6" },
  { jobTitle: "BI Developer", companyName: "Bank Mandiri", platform: "JobStreet", location: "Jakarta", daysAgo: 40, status: "REJECTED", url: "https://jobstreet.co.id/job/seed-7" },
  { jobTitle: "Data Analyst", companyName: "Shopee", platform: "Indeed", location: "Jakarta", daysAgo: 55, status: "ACCEPTED", url: "https://indeed.com/viewjob?jk=seed8" },
  { jobTitle: "Reporting Analyst", companyName: "Telkomsel", platform: "Kalibrr", location: "Bandung", daysAgo: 70, status: "REJECTED", url: "https://kalibrr.com/jobs/seed-9" },
  { jobTitle: "Growth Analyst", companyName: "Blibli", platform: "Glints", location: "Jakarta", daysAgo: 90, status: "INTERVIEW", url: "https://glints.com/id/opportunities/jobs/seed-10" },
  { jobTitle: "Data Analyst Intern", companyName: "Sirclo", platform: "JobStreet", location: "Remote", daysAgo: 110, status: "ACCEPTED", url: "https://jobstreet.co.id/job/seed-11" },
  { jobTitle: "Quantitative Analyst", companyName: "Sea Group", platform: "LinkedIn", location: "Singapore", daysAgo: 130, status: "REJECTED", url: "https://linkedin.com/jobs/seed-12" },
];

function historyFor(status: ApplicationStatus) {
  const idx = PIPELINE.indexOf(status);
  const path = idx >= 0 ? PIPELINE.slice(0, idx + 1) : ["APPLIED", status];
  return path;
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash: await hashPassword(DEMO_PASSWORD) },
    create: {
      email: DEMO_EMAIL,
      name: "Demo Workspace",
      passwordHash: await hashPassword(DEMO_PASSWORD),
    },
  });

  await prisma.application.deleteMany({ where: { userId: user.id } });

  for (const seed of SEEDS) {
    const appliedAt = new Date(Date.now() - seed.daysAgo * 86_400_000);
    const path = historyFor(seed.status);
    const stepMs = (seed.daysAgo * 86_400_000) / Math.max(path.length, 1);

    await prisma.application.create({
      data: {
        userId: user.id,
        jobTitle: seed.jobTitle,
        companyName: seed.companyName,
        platform: seed.platform,
        location: seed.location,
        jobUrl: seed.url,
        appliedAt,
        status: seed.status,
        source: seed.daysAgo % 3 === 0 ? "EXTENSION" : "MANUAL",
        lastStatusChangeAt: new Date(
          appliedAt.getTime() + stepMs * (path.length - 1),
        ),
        statusHistory: {
          create: path.map((s, i) => ({
            oldStatus: i === 0 ? null : (path[i - 1] as ApplicationStatus),
            newStatus: s as ApplicationStatus,
            changedAt: new Date(appliedAt.getTime() + stepMs * i),
            note: i === 0 ? "Application created" : undefined,
          })),
        },
      },
    });
  }

  console.log(`Seeded ${SEEDS.length} applications for ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
