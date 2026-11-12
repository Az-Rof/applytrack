/**
 * Dump Glints-imported applications + their status history. Run with:
 *   npx tsx scripts/verify-glints-import.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
const rows = await prisma.application.findMany({
  where: { platform: "Glints" },
  include: { statusHistory: { orderBy: { changedAt: "asc" } } },
  orderBy: { appliedAt: "desc" },
});

console.log("Glints applications in DB:", rows.length);
for (const app of rows) {
  console.log(
    [
      app.appliedAt.toISOString().slice(0, 16),
      app.status.padEnd(14),
      app.source.padEnd(9),
      (app.companyName || "?").padEnd(26),
      app.jobTitle,
      "| ext:", app.externalId ?? "-",
      "| loc:", app.location ?? "-",
      "| type:", app.employmentType ?? "-",
      "| salary:", app.salary ?? "-",
      "| hist:", app.statusHistory.length,
      "| url:", app.jobUrl ?? "-",
    ].join(" "),
  );
  for (const h of app.statusHistory) {
    console.log(
      "    ",
      h.changedAt.toISOString().slice(0, 16).padEnd(18),
      String(h.oldStatus ?? "∅").padEnd(9),
      "→",
      h.newStatus.padEnd(14),
      "|",
      h.note ?? "",
    );
  }
}
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
