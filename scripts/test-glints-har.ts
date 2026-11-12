/**
 * Quick sanity check for the Glints HAR parser. Run with:
 *   npx tsx scripts/test-glints-har.ts [path/to/file.har]
 */
import fs from "fs";

import {
  extractGlintsCandidates,
  mapGlintsStatus,
} from "../src/lib/import/glints";

const file = process.argv[2] ?? "E:/Project/download.har";
const har = JSON.parse(fs.readFileSync(file, "utf8"));

const { candidates, companiesFound } = extractGlintsCandidates(har);
console.log("candidates:", candidates.length, "| companies found:", companiesFound);

for (const c of candidates) {
  console.log(
    [
      c.appliedAt.toISOString().slice(0, 16),
      c.platformStatus.padEnd(10),
      "→",
      mapGlintsStatus(c.platformStatus).padEnd(14),
      (c.companyName || "?").padEnd(28),
      c.jobTitle,
      "| loc:", c.location ?? "-",
      "| type:", c.employmentType ?? "-",
      "| salary:", c.salary ?? "-",
      "| timeline:", c.timeline?.length ?? 0,
    ].join(" "),
  );
}

const detail = candidates.find((c) => c.timeline?.length);
if (detail) {
  console.log("\ntimeline sample for", detail.jobTitle);
  for (const ev of detail.timeline!) {
    console.log("  ", ev.at.toISOString().slice(0, 16), mapGlintsStatus(ev.status).padEnd(14), ev.message ?? "");
  }
}
