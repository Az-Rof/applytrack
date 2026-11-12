/**
 * Quick sanity check for the JobStreet HAR parser. Run with:
 *   npx tsx scripts/test-jobstreet-har.ts [path/to/file.har]
 */
import fs from "fs";

import {
  extractJobStreetCandidates,
  mapJobStreetStatus,
} from "../src/lib/import/jobstreet";

const file = process.argv[2] ?? "C:/Users/Administrator/Downloads/Jobstreet.har";
const har = JSON.parse(fs.readFileSync(file, "utf8"));

const { candidates } = extractJobStreetCandidates(har);
console.log("candidates:", candidates.length);

for (const c of candidates) {
  console.log(
    [
      `[${c.platform}]`,
      c.appliedAt.toISOString().slice(0, 16),
      c.platformStatus.padEnd(12),
      "→",
      mapJobStreetStatus(c.platformStatus).padEnd(14),
      (c.companyName || "?").padEnd(28),
      c.jobTitle,
      "| loc:", c.location ?? "-",
      "| salary:", c.salary ?? "-",
      "| url:", c.jobUrl,
      "| extId:", c.externalId,
      "| timeline:", c.timeline?.length ?? 0,
    ].join(" "),
  );
}

const first = candidates.find((c) => c.timeline?.length);
if (first) {
  console.log("\ntimeline for", first.jobTitle);
  for (const ev of first.timeline!) {
    console.log("  ", ev.at.toISOString().slice(0, 16), mapJobStreetStatus(ev.status).padEnd(14), `[${ev.status}]`);
  }
}
