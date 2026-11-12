/**
 * ApplyTrack — Background Service Worker
 *
 * Auth: email + password (12 Nov 2026 — the old workspace-code auth is
 * gone). The user logs in once in the popup (or the options page), the
 * login returns a session token, and it is stored in extension storage
 * (`sessionToken` + `sessionEmail` + `sessionApiUrl`).
 *  1. Every capture/sync sends the token via `X-ApplyTrack-Session` — the
 *     server resolves it to the user `id`. No cookies are involved.
 *  2. On a 401 the token is cleared once and the user is told to log in
 *     again (a session expires after 30 days or after logout).
 *  3. "Open dashboard" navigates to `${apiUrl}/` — the web dashboard has
 *     its own login (same email + password, cookie session).
 */

const DEFAULTS = {
  apiUrl: "http://localhost:3000",
  apiKey: "change-me",
  autoCapture: true,
};

async function getSettings() {
  const settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  // A trailing slash saved in Settings (typed before the trim was added)
  // would make every `${apiUrl}/api/...` URL double-slashed and 404.
  settings.apiUrl =
    String(settings.apiUrl || DEFAULTS.apiUrl).replace(/\/+$/, "") || DEFAULTS.apiUrl;
  return settings;
}

/** The stored login session (token + email), or null when logged out. */
async function getSession(apiUrl) {
  const { sessionToken, sessionEmail, sessionApiUrl } =
    await chrome.storage.local.get({
      sessionToken: null,
      sessionEmail: null,
      sessionApiUrl: null,
    });
  if (!sessionToken || sessionApiUrl !== apiUrl) return null;
  return { token: sessionToken, email: sessionEmail };
}

/** The stored session token, or a login error asking the user to log in. */
async function requireSession(apiUrl) {
  const session = await getSession(apiUrl);
  if (!session) {
    throw new Error(
      "Not logged in — open the extension popup and log in with your email and password",
    );
  }
  return session;
}

/** Forget the stored session (after a 401, or on logout). */
async function clearSession() {
  await chrome.storage.local.remove([
    "sessionToken",
    "sessionEmail",
    "sessionApiUrl",
  ]);
}

async function postCapture(payload) {
  const { apiUrl, apiKey } = await getSettings();
  const session = await requireSession(apiUrl);

  const res = await fetch(`${apiUrl}/api/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-ApplyTrack-Session": session.token,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    // Session expired or logged out elsewhere — forget it once so the next
    // attempt shows the login prompt instead of failing again silently.
    await clearSession();
    throw new Error(
      "Session expired — open the extension popup and log in again",
    );
  }

  if (!res.ok) {
    const hint = data.hint ? ` (${data.hint})` : "";
    throw new Error(data.error || `HTTP ${res.status}${hint}`);
  }

  return data;
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
    });
  } catch {
    /* notifications are optional */
  }
}

async function logActivity(entry) {
  const { activity = [] } = await chrome.storage.local.get({ activity: [] });
  activity.unshift({ ...entry, at: new Date().toISOString() });
  await chrome.storage.local.set({ activity: activity.slice(0, 30) });
}

// ---------------------------------------------------------------------------
// Glints application sync
// ---------------------------------------------------------------------------

/**
 * The pull runs IN this browser on purpose: glints.com's API is behind a
 * firewall that blocks server-side requests (it answers 403 with a
 * "Glints - Firewall" HTML page, no matter the cookie). Requests made here
 * carry the user's real session and pass the firewall — and the session
 * cookie itself is never sent to ApplyTrack, only the raw API payloads.
 */

const GLINTS_ORIGIN = "https://glints.com";
const PAGE_SIZE = 20;
const MAX_PAGES = 50;
const MAX_DETAILS = 500;
const PULL_DELAY_MS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Same "include" the My Applications detail page requests (status timeline). */
function detailInclude() {
  return encodeURIComponent(
    JSON.stringify([
      {
        association: "Job",
        include: [
          { association: "Company", attributes: ["id", "name", "brandName", "logo"] },
          { association: "JobSkills" },
          { association: "Groups" },
          { association: "JobSalaries" },
          { association: "City" },
          { association: "Country" },
        ],
      },
    ]),
  );
}

async function glintsGetJson(path) {
  const res = await fetch(GLINTS_ORIGIN + path, {
    credentials: "include",
    headers: { Accept: "application/json, text/plain, */*" },
  });
  if (res.status === 401) {
    throw new Error("Glints session expired — open glints.com and log in");
  }
  if (res.status === 403) {
    const text = await res.text().catch(() => "");
    if (/^\s*<!doctype/i.test(text)) {
      throw new Error(
        "Glints firewall blocked this request — open glints.com in this browser and retry",
      );
    }
    throw new Error("Glints session expired — open glints.com and log in");
  }
  if (!res.ok) {
    throw new Error(`Glints API returned HTTP ${res.status}`);
  }
  return res.json();
}

/** Collect { list, details, companies } from the user's live Glints session. */
async function pullGlintsPayloads() {
  const list = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await glintsGetJson(
      `/api/me/applications?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&include=Job&order=createdAt%20DESC`,
    );
    const rows = Array.isArray(json?.data) ? json.data : [];
    list.push(...rows);
    const total = typeof json?.count === "number" ? json.count : list.length;
    if (rows.length < PAGE_SIZE || list.length >= total) break;
  }

  const applicationIds = [];
  const companyIds = new Set();
  for (const row of list) {
    if (typeof row?.id === "string" && UUID_RE.test(row.id)) {
      applicationIds.push(row.id);
    }
    const job = row?.job ?? row?.links?.job;
    const companyId = typeof job?.CompanyId === "string" ? job.CompanyId : null;
    if (companyId && UUID_RE.test(companyId)) {
      companyIds.add(companyId);
    }
  }

  const companies = [];
  const attributes = encodeURIComponent(
    JSON.stringify(["id", "name", "brandName", "logo"]),
  );
  const companyChunk = [];
  for (const id of companyIds) {
    companyChunk.push(id);
    if (companyChunk.length === 40) {
      const where = encodeURIComponent(
        JSON.stringify({ id: { $in: companyChunk.slice() } }),
      );
      companies.push(
        await glintsGetJson(
          `/api/companies?includeHierarchicalLocation=true&attributes=${attributes}&where=${where}`,
        ),
      );
      companyChunk.length = 0;
      await sleep(PULL_DELAY_MS);
    }
  }
  if (companyChunk.length) {
    const where = encodeURIComponent(
      JSON.stringify({ id: { $in: companyChunk.slice() } }),
    );
    companies.push(
      await glintsGetJson(
        `/api/companies?includeHierarchicalLocation=true&attributes=${attributes}&where=${where}`,
      ),
    );
  }

  const details = [];
  for (const id of applicationIds.slice(0, MAX_DETAILS)) {
    details.push(
      await glintsGetJson(
        `/api/me/applications/${id}?includeApplicationStatusTracking=true&include=${detailInclude()}`,
      ),
    );
    await sleep(PULL_DELAY_MS);
  }

  return { list, details, companies };
}

async function postGlintsSync({ apiUrl, apiKey, token, payloads }) {
  const res = await fetch(`${apiUrl}/api/sync/glints`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-ApplyTrack-Session": token,
    },
    body: JSON.stringify({ payloads }),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    await clearSession();
    throw new Error(
      "Session expired — open the extension popup and log in again",
    );
  }
  if (!res.ok) {
    const hint = data.hint ? ` — ${data.hint}` : "";
    throw new Error((data.error || `HTTP ${res.status}`) + hint);
  }
  return data;
}

/** One-click sync: pull everything in this browser, then let the server upsert. */
async function syncGlintsApplications() {
  const { apiUrl, apiKey } = await getSettings();

  const session = await requireSession(apiUrl);

  // Cheap logged-in check: this browser must hold glints.com cookies.
  const cookies = await chrome.cookies.getAll({ domain: "glints.com" });
  const live = cookies.filter(
    (c) => !c.expirationDate || c.expirationDate * 1000 > Date.now(),
  );
  if (!live.length) {
    throw new Error("No glints.com session in this browser — open glints.com and log in");
  }

  const payloads = await pullGlintsPayloads();
  return postGlintsSync({ apiUrl, apiKey, token: session.token, payloads });
}

// ---------------------------------------------------------------------------
// One sync entry point for every platform
// ---------------------------------------------------------------------------

/**
 * Satu fungsi sync di background worker — Glints only. JobStreet sync
 * dihapus pada 12 Nov 2026 (sync-nya gagal, fokus ke Glints). Popup mengirim
 * `{ type: "APPLYTRACK_SYNC_PLATFORM", platform: "Glints" }`; tipe pesan
 * lama (`APPLYTRACK_SYNC_GLINTS`) tetap diterima supaya popup lama tidak
 * rusak.
 *
 * Catatan: jangan daftarkan platform di sini tanpa fungsinya — referensi
 * ke fungsi yang tidak ada akan menggagalkan seluruh service worker saat
 * load (itu yang membuat sync gagal total di versi redesign pertama).
 */
const PLATFORM_SYNC_RUNNERS = {
  Glints: syncGlintsApplications,
};

async function syncPlatform(platform) {
  const run = PLATFORM_SYNC_RUNNERS[platform];
  if (!run) throw new Error(`Unknown platform: ${platform}`);
  const result = await run();

  const summary = result.summary ?? {};
  const messageText = `${summary.created ?? 0} new · ${summary.updated ?? 0} updated · ${summary.unchanged ?? 0} unchanged`;
  await logActivity({ status: "synced", label: `${platform} sync`, platform });
  notify(
    "Application sync finished",
    messageText + (summary.conflicts?.length ? ` · ${summary.conflicts.length} conflicts` : ""),
  );
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const platform =
    message?.type === "APPLYTRACK_SYNC_PLATFORM"
      ? message.platform
      : message?.type === "APPLYTRACK_SYNC_GLINTS"
        ? "Glints"
        : null;
  if (!platform) return;

  (async () => {
    try {
      const result = await syncPlatform(platform);
      sendResponse({ ok: true, result });
    } catch (err) {
      const error = String(err.message || err);
      await logActivity({ status: "error", label: `${platform} sync`, platform, error });
      notify(`${platform} sync failed`, `${error} — then press Sync again`);
      sendResponse({ ok: false, error });
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "APPLYTRACK_GET_SESSION") {
    (async () => {
      const { apiUrl } = await getSettings();
      const session = await getSession(apiUrl);
      sendResponse({ ok: true, session });
    })();
    return true;
  }

  if (message?.type === "APPLYTRACK_LOGOUT") {
    (async () => {
      const { apiUrl } = await getSettings();
      const session = await getSession(apiUrl);
      if (session) {
        // Tell the server to delete the session row (best-effort).
        await fetch(`${apiUrl}/api/auth/logout`, {
          method: "DELETE",
          headers: { "X-ApplyTrack-Session": session.token },
        }).catch(() => undefined);
      }
      await clearSession();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type !== "APPLYTRACK_CAPTURE") return;

  (async () => {
    const settings = await getSettings();
    if (!settings.autoCapture && message.reason !== "manual") {
      sendResponse({ skipped: true });
      return;
    }

    try {
      const result = await postCapture(message.payload);
      const app = result.application;
      const label = `${app.jobTitle} @ ${app.companyName}`;

      await logActivity({
        status: result.duplicate ? "duplicate" : "captured",
        label,
        platform: app.platform,
        id: app.id,
      });

      if (result.duplicate) {
        notify("Already tracked", `${label} is already in ApplyTrack.`);
      } else {
        notify("Application captured ✓", `${label} (${app.platform})`);
      }
      sendResponse({ ok: true, result });
    } catch (err) {
      const error = String(err.message || err);
      await logActivity({
        status: "error",
        label: message.payload?.jobTitle || "Unknown job",
        platform: message.payload?.platform || "",
        error,
      });
      // Content-validation failures ("capture fired on a page without job
      // context") are noisy for auto-capture — log them only, no popup.
      if (!/could not extract required fields/i.test(error)) {
        notify("Capture failed", error);
      }
      sendResponse({ ok: false, error });
    }
  })();

  return true; // keep the message channel open for async response
});
