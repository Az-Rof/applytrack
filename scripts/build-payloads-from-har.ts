/**
 * Builds the same `{ payloads: { list, details, companies } }` shape the
 * extension sends after its in-browser pull, but sources it from a HAR file
 * (the HAR contains the raw API response bodies of exactly those endpoints).
 * Output goes to a JSON file that can be POSTed to /api/sync/glints to test
 * the extension synchronisation path end-to-end.
 *
 * Usage: npx tsx scripts/build-payloads-from-har.ts [harPath] [outPath]
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , harPath, outPath] = process.argv;
const har = JSON.parse(
  readFileSync(harPath ?? "E:/Project/download.har", "utf8"),
);

const list: unknown[] = [];
const details: unknown[] = [];
const companies: unknown[] = [];

for (const entry of har.log?.entries ?? []) {
  const url: string = entry.request?.url ?? "";
  const text: string = entry.response?.content?.text ?? "";
  if (!text) continue;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    continue;
  }
  // Order matters: the detail path is a prefix of the list path.
  if (/\/api\/me\/applications\/[0-9a-f-]{32,}/i.test(url)) {
    details.push(body);
  } else if (/\/api\/me\/applications\?/.test(url)) {
    const data = (body as { data?: unknown[] })?.data;
    if (Array.isArray(data)) list.push(...data);
  } else if (/\/api\/companies\?/.test(url)) {
    companies.push(body);
  }
}

const payloads = { payloads: { list, details, companies } };
const out = outPath ?? "payloads-test.json";
writeFileSync(out, JSON.stringify(payloads));
console.log(
  `Wrote ${out}: ${list.length} list rows, ${details.length} details, ${companies.length} companies`,
);
