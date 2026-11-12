/**
 * Test harness for same-workspace dedupe: wipes previous DEMO import rows,
 * seeds one row that mimics what the Chrome extension would have captured
 * (real page URL, no externalId), so the HAR sync must match it instead of
 * creating a duplicate.
 *
 * Run with: npx tsx scripts/seed-demo-duplicate.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const demo = await prisma.user.upsert({
    where: { email: "demo@applytrack.dev" },
    update: {},
    create: { email: "demo@applytrack.dev", name: "Demo Workspace" },
  });

  const wiped = await prisma.application.deleteMany({
    where: { userId: demo.id, source: "IMPORT" },
  });
  console.log("deleted IMPORT rows:", wiped.count);

  // Mimic the extension capture of the Migoz Group job (Glints jobId
  // 111d465e-4226-4e26-b812-8eb408d9841c appears in the real page URL).
  const jobId = "111d465e-4226-4e26-b812-8eb408d9841c";
  await prisma.application.deleteMany({
    where: { userId: demo.id, jobUrl: { contains: jobId } },
  });
  const seeded = await prisma.application.create({
    data: {
      userId: demo.id,
      jobTitle: "DATA ANALYST",
      companyName: "Migoz Group",
      platform: "Glints",
      location: "Surakarta",
      jobUrl: `https://glints.com/id/opportunities/jobs/data-analyst/${jobId}`,
      employmentType: "Full-time",
      salary: "2600000 - 3000000 IDR / month",
      appliedAt: new Date("2026-10-24T16:31:40.000Z"),
      status: "APPLIED",
      source: "EXTENSION",
      statusHistory: {
        create: { oldStatus: null, newStatus: "APPLIED", note: "Application created" },
      },
    },
  });
  console.log("seeded extension-like row:", seeded.id);

  const total = await prisma.application.count({ where: { userId: demo.id } });
  console.log("demo workspace total:", total);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
