/**
 * ApplyTrack — Content Script
 *
 * Strategy:
 *  1. Detect "Apply" clicks / form submits (click delegation + submit listener).
 *  2. After a short delay give the SPA time to navigate, then scrape the page.
 *  3. Send the payload to the background service worker, which POSTs to the API.
 */

const PLATFORM_RULES = {
  "glints.com": { name: "Glints" },
  "linkedin.com": { name: "LinkedIn" },
  "kalibrr.com": { name: "Kalibrr" },
  "indeed.com": { name: "Indeed" },
};

function platformForHost() {
  const host = location.hostname.replace(/^www\./, "");
  for (const key of Object.keys(PLATFORM_RULES)) {
    if (host.endsWith(key)) return PLATFORM_RULES[key].name;
  }
  return "Others";
}

/* ------------------------------- scraping ------------------------------- */

function firstText(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim()) {
      return el.textContent.trim().replace(/\s+/g, " ");
    }
  }
  return "";
}

/** Parse schema.org baseSalary (single value or min–max range) to text. */
function jsonLdSalary(node) {
  const bs = node.baseSalary;
  const v = bs?.value ?? {};
  const currency = bs?.currency || v.currency || "";
  if (v.value != null) {
    return `${v.value}${currency ? ` ${currency}` : ""}`.trim();
  }
  if (v.minValue != null || v.maxValue != null) {
    const range = [v.minValue, v.maxValue].filter((x) => x != null).join(" - ");
    const unit = v.unitText ? ` / ${String(v.unitText).toLowerCase()}` : "";
    return `${range}${currency ? ` ${currency}` : ""}${unit}`.trim();
  }
  return "";
}

/** Standalone employment-type words (EN/ID) → canonical label. */
const EMPLOYMENT_TYPE_WORDS = {
  "full-time": "Full-time",
  "full time": "Full-time",
  "penuh waktu": "Full-time",
  permanent: "Full-time",
  "part-time": "Part-time",
  "part time": "Part-time",
  "paruh waktu": "Part-time",
  contract: "Contract",
  kontrak: "Contract",
  temporary: "Contract",
  internship: "Internship",
  intern: "Internship",
  magang: "Internship",
  freelance: "Freelance",
};

/** Scan small leaf elements for a standalone employment-type word. */
function findEmploymentType() {
  const els = document.querySelectorAll("div, span, p, li, td, a, button");
  const limit = Math.min(els.length, 3000);
  for (let i = 0; i < limit; i++) {
    const el = els[i];
    if (el.children.length > 0) continue; // leaves only — avoid big containers
    const text = (el.textContent ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!text || text.length > 25) continue;
    const mapped = EMPLOYMENT_TYPE_WORDS[text];
    if (mapped) return mapped;
  }
  return "";
}

/** Best-effort: first salary-looking amount (Rp/IDR) in the main content. */
function findSalaryText() {
  const root = document.querySelector("main") ?? document.body;
  const text = (root.innerText || "").replace(/\s+/g, " ");
  const m = text.match(
    /(?:Rp|IDR)\s?[\d.,]+\s*(?:[-–—]\s*(?:Rp\s?)?[\d.,]+)?(?:\s*\/?\s*(?:bulan|bln|month|jam|hour|hari|day|tahun|thn|year))?/i,
  );
  return m ? m[0].trim() : "";
}

function fromJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent);
      const list = Array.isArray(data) ? data : [data];
      for (const node of list) {
        if (node["@type"] === "JobPosting") {
          return {
            jobTitle: node.title ?? "",
            companyName:
              (typeof node.hiringOrganization === "string"
                ? node.hiringOrganization
                : node.hiringOrganization?.name) ?? "",
            location:
              node.jobLocation?.address?.addressLocality ??
              (Array.isArray(node.jobLocation)
                ? node.jobLocation[0]?.address?.addressLocality
                : "") ??
              "",
            employmentType: Array.isArray(node.employmentType)
              ? node.employmentType[0]
              : node.employmentType ?? "",
            salary: jsonLdSalary(node),
            description: (node.description ?? "").replace(/<[^>]+>/g, " ").slice(0, 3000),
          };
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return null;
}

function scrapePage() {
  const platform = platformForHost();
  const jsonLd = fromJsonLd() ?? {};

  let jobTitle = jsonLd.jobTitle;
  let companyName = jsonLd.companyName;

  // Platform-specific selectors (best-effort, kept short & resilient)
  if (platform === "LinkedIn") {
    jobTitle ||= firstText([
      ".job-details-jobs-unified-top-card__job-title h1",
      ".jobs-unified-top-card__job-title",
      "h1",
    ]);
    companyName ||= firstText([
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
    ]);
  } else if (platform === "Glints") {
    jobTitle ||= firstText(["h1"]);
    companyName ||= firstText(["a[href*='/companies/']", "[data-testid='company-name']"]);
  } else if (platform === "Kalibrr") {
    jobTitle ||= firstText(["h1"]);
    companyName ||= firstText(["a[href*='/c/']", ".company-name"]);
  } else if (platform === "Indeed") {
    jobTitle ||= firstText([".jobsearch-JobInfoHeader-title", "h1"]);
    companyName ||= firstText([
      "[data-testid='inlineHeader-companyName']",
      ".jobsearch-CompanyInfoContainer a",
    ]);
  }

  jobTitle ||= document.title.split(/[|\-–]/)[0].trim();
  const canonical = document.querySelector('link[rel="canonical"]')?.href ?? location.href;

  return {
    jobTitle,
    companyName,
    platform,
    location: jsonLd.location || firstText(["[data-automation='job-detail-location']", ".location"]),
    employmentType: jsonLd.employmentType || findEmploymentType(),
    salary: jsonLd.salary || findSalaryText(),
    jobUrl: canonical,
    pageText: (
      jsonLd.description ||
      document.body.innerText ||
      ""
    ).slice(0, 8000),
    appliedAt: new Date().toISOString(),
  };
}

/* ----------------------------- apply detection ----------------------------
 * Two-phase capture: clicking "Apply/Lamar" usually only OPENS the
 * application flow (CV upload, questionnaires, skills steps). The capture is
 * sent only when a completion signal appears — the final submit click, a
 * success message, or navigation to a success URL. Job data is snapshotted
 * when the flow opens, while the job details are still on screen.
 */

const APPLY_FLOW_RE =
  /\b(apply|lamar|melamar|quick apply|easy apply|apply now|apply for this job)\b/i;
const SUBMIT_RE = /\b(kirim|submit|send|selesai|finish|done)\b/i;
const SUCCESS_TEXT_RE =
  /(lamaran(?!.{0,10}akan).{0,30}(terkirim|dikirim|diterima)|berhasil melamar|application.{0,30}(submitted|sent|received)|successfully (applied|submitted)|thanks for applying)/i;
const SUCCESS_URL_RE = /applied|application[-_]?(sent|submitted|success)|successfully|success|thanks/i;
const APPLIED_LIST_RE = /my-activity|applied-jobs/i;

const FLOW_TIMEOUT_MS = 10 * 60 * 1000; // user has 10 minutes to finish

let lastCapture = 0;
let flowActive = false;
let captured = false;
let flowDeadline = 0;
let pendingPayload = null;

function labelOf(el) {
  if (!el) return "";
  return [
    el.getAttribute?.("aria-label"),
    el.getAttribute?.("title"),
    el.getAttribute?.("data-testid"),
    el.innerText,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Phase 1: an Apply-like interaction opens the flow — snapshot, don't send. */
function startFlow() {
  if (captured && Date.now() - lastCapture < 30_000) return;
  flowActive = true;
  captured = false;
  flowDeadline = Date.now() + FLOW_TIMEOUT_MS;
  // The job details are on screen right now — success screens replace them.
  pendingPayload = scrapePage();
}

/** Phase 2: completion detected — send the (snapshotted) application. */
function capture(reason) {
  const now = Date.now();
  if (now - lastCapture < 30_000) return;
  lastCapture = now;
  captured = true;
  flowActive = false;
  const payload = pendingPayload;
  pendingPayload = null;
  setTimeout(() => {
    const data = payload ?? scrapePage();
    chrome.runtime.sendMessage({ type: "APPLYTRACK_CAPTURE", payload: data, reason });
  }, 2500);
}

function isCompletionSignal(label) {
  if (label && label.length < 120 && SUBMIT_RE.test(label)) return true;
  const text = document.body.innerText || "";
  if (SUCCESS_TEXT_RE.test(text.slice(0, 30000))) return true;
  if (
    SUCCESS_URL_RE.test(location.pathname) &&
    !APPLIED_LIST_RE.test(location.pathname)
  ) {
    return true;
  }
  return false;
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const el = target?.closest("button, a, [role='button'], input[type='submit']");
    if (!el) return;
    const label = labelOf(el);
    if (flowActive && !captured && isCompletionSignal(label)) {
      capture("flow-complete");
    } else if (APPLY_FLOW_RE.test(label) && label.length < 120) {
      startFlow();
    }
  },
  true,
);

document.addEventListener(
  "submit",
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const label = labelOf(event.submitter ?? null);
    if (flowActive && !captured && isCompletionSignal(label)) capture("form-submit");
  },
  true,
);

// Direct hit on an apply page (external ATS redirect, bookmark): watch for
// completion without an initial "Apply" click.
if (/\/apply(\/|$)/i.test(location.pathname)) startFlow();

// Success page loaded directly (e.g. redirect after an external ATS form).
if (
  SUCCESS_URL_RE.test(location.pathname) &&
  !APPLIED_LIST_RE.test(location.pathname) &&
  !/\/apply/i.test(location.pathname)
) {
  capture("success-page");
}

// Poll for success messages (SPAs often swap content without URL changes).
setInterval(() => {
  if (!flowActive || captured) return;
  if (Date.now() > flowDeadline) {
    flowActive = false;
    pendingPayload = null;
    return;
  }
  if (isCompletionSignal(null)) capture("success-detected");
}, 2000);

// Manual capture from the popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "APPLYTRACK_SCRAPE") {
    sendResponse({ payload: scrapePage() });
    return true;
  }
});
