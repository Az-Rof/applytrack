const statusEl = document.getElementById("status");
const captureBtn = document.getElementById("capture");
const syncBtn = document.getElementById("syncGlints");
const openBtn = document.getElementById("open");
const optionsBtn = document.getElementById("options");
const activityEl = document.getElementById("activity");

const authLoggedOut = document.getElementById("authLoggedOut");
const authLoggedIn = document.getElementById("authLoggedIn");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authLoginBtn = document.getElementById("authLogin");
const authLogoutBtn = document.getElementById("authLogout");
const authEmailText = document.getElementById("authEmailText");

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

async function getApiUrl() {
  const { apiUrl } = await chrome.storage.sync.get({ apiUrl: "http://localhost:3000" });
  // Guard against a trailing slash saved by an older settings page.
  return String(apiUrl || "http://localhost:3000").replace(/\/+$/, "") || "http://localhost:3000";
}

/* ------------------------------- auth ---------------------------------- */
/**
 * Email + password auth (12 Nov 2026 — the old workspace-code auth is
 * gone). The login returns a session token; it is stored in extension
 * storage and sent as `X-ApplyTrack-Session` by the background worker.
 * The same email + password logs into the web dashboard.
 */
async function getSession() {
  const res = await chrome.runtime.sendMessage({ type: "APPLYTRACK_GET_SESSION" });
  return res?.session ?? null;
}

async function renderAuth() {
  const session = await getSession().catch(() => null);
  const loggedIn = Boolean(session);
  authLoggedOut.hidden = loggedIn;
  authLoggedIn.hidden = !loggedIn;
  if (loggedIn) authEmailText.textContent = session.email ?? "Logged in";
  syncBtn.disabled = !loggedIn;
  captureBtn.disabled = !loggedIn;
  if (!loggedIn) setStatus("Log in above to sync and capture.");
}

authLoginBtn.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    setStatus("Enter your email and password.", "err");
    return;
  }
  authLoginBtn.disabled = true;
  setStatus("Logging in…");
  let apiUrl = "";
  try {
    apiUrl = await getApiUrl();
    const res = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 500) {
      // The old database schema has no passwordHash column — the user
      // hasn't run the migration yet; say so instead of a bare 500.
      throw new Error(
        "Server error — the database still needs the migration. In the project folder run: npm run db:migrate-auth",
      );
    }
    if (!res.ok || !data.token) {
      throw new Error(data.error || `Login failed (HTTP ${res.status})`);
    }
    await chrome.storage.local.set({
      sessionToken: data.token,
      sessionEmail: data.user?.email ?? email,
      sessionApiUrl: apiUrl,
    });
    authPasswordInput.value = "";
    setStatus(`Logged in as ${data.user?.email ?? email} ✓`, "ok");
    await renderAuth();
  } catch (err) {
    const raw = String(err.message || err);
    // fetch() itself throws when the dev server is down — surface that
    // clearly instead of the cryptic "Failed to fetch".
    const msg = /failed to fetch|networkerror|load failed/i.test(raw)
      ? `Can't reach the ApplyTrack server at ${apiUrl || "http://localhost:3000"} — is \`npm run dev\` running?`
      : raw;
    setStatus(msg, "err");
  } finally {
    authLoginBtn.disabled = false;
  }
});

authLogoutBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "APPLYTRACK_LOGOUT" }).catch(() => undefined);
  setStatus("Logged out.");
  await renderAuth();
});

async function renderActivity() {
  const { activity = [] } = await chrome.storage.local.get({ activity: [] });
  activityEl.innerHTML = "";
  if (!activity.length) {
    activityEl.innerHTML = '<li>No captures yet.</li>';
    return;
  }
  for (const item of activity) {
    const li = document.createElement("li");
    const cls =
      item.status === "error" ? "err" : item.status === "duplicate" ? "dup" : "ok";
    li.className = cls;
    li.innerHTML = `<span class="dot"></span>${escapeHtml(item.label)}<small>${escapeHtml(
      item.platform || "",
    )} · ${new Date(item.at).toLocaleString()}${item.error ? ` · ${escapeHtml(item.error)}` : ""}</small>`;
    activityEl.appendChild(li);
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function formatSummary(summary = {}) {
  const parts = [];
  if (summary.created) parts.push(`${summary.created} new`);
  if (summary.updated) parts.push(`${summary.updated} updated`);
  if (summary.unchanged) parts.push(`${summary.unchanged} unchanged`);
  if (summary.conflicts?.length) parts.push(`${summary.conflicts.length} conflicts`);
  return parts.join(" · ");
}

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  setStatus("Capturing…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    const response = await chrome.tabs.sendMessage(tab.id, { type: "APPLYTRACK_SCRAPE" });
    if (!response?.payload) throw new Error("Could not read this page");

    const result = await chrome.runtime.sendMessage({
      type: "APPLYTRACK_CAPTURE",
      payload: response.payload,
      reason: "manual",
    });

    if (result?.ok) {
      setStatus(
        result.result.duplicate
          ? "Already tracked ✓"
          : `Captured: ${result.result.application.jobTitle}`,
        "ok",
      );
    } else {
      throw new Error(result?.error || "Capture failed");
    }
    await renderActivity();
  } catch (err) {
    const raw = String(err.message || err);
    const msg = /could not extract required fields/i.test(raw)
      ? "Capture failed — open the job's detail page first (title & company visible), then press Capture"
      : raw;
    setStatus(msg, "err");
  } finally {
    captureBtn.disabled = false;
  }
});

/**
 * Satu fungsi sync di popup — Glints only. JobStreet dihapus 12 Nov 2026,
 * jadi yang tersisa satu tombol ini. Background worker-nya satu:
 * `APPLYTRACK_SYNC_PLATFORM` + platform.
 */
async function syncPlatform(platform, button) {
  const origin = "glints.com";
  button.disabled = true;
  setStatus(
    `Syncing from ${origin}…${platform === "Glints" ? " (can take ~30s)" : ""}`,
  );
  try {
    const res = await chrome.runtime.sendMessage({
      type: "APPLYTRACK_SYNC_PLATFORM",
      platform,
    });
    if (!res?.ok) throw new Error(res?.error || "Sync failed");

    const summaryText = formatSummary(res.result?.summary);
    const conflicts = res.result?.summary?.conflicts?.length;
    setStatus(
      summaryText
        ? `${platform} sync ✓ ${summaryText}`
        : `${platform} sync ✓ (nothing to change)`,
      conflicts ? "" : "ok",
    );
    await renderActivity();
    return { ok: true, summary: res.result?.summary ?? {} };
  } catch (err) {
    setStatus(String(err.message || err), "err");
    return { ok: false, error: String(err.message || err) };
  } finally {
    button.disabled = false;
  }
}

// The one sync button — Glints only.
syncBtn.addEventListener("click", () => syncPlatform("Glints", syncBtn));

openBtn.addEventListener("click", async () => {
  const apiUrl = await getApiUrl();
  chrome.tabs.create({ url: `${apiUrl}/` });
});

optionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

renderActivity();
renderAuth();
