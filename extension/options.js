const DEFAULTS = {
  apiUrl: "http://localhost:3000",
  apiKey: "change-me",
  autoCapture: true,
};

const apiUrl = document.getElementById("apiUrl");
const apiKey = document.getElementById("apiKey");
const autoCapture = document.getElementById("autoCapture");
const saved = document.getElementById("saved");

chrome.storage.sync.get(DEFAULTS, (settings) => {
  apiUrl.value = settings.apiUrl;
  apiKey.value = settings.apiKey;
  autoCapture.checked = settings.autoCapture;
});

/* ------------------------------- account ------------------------------- */
/** Email + password login — replaces the old workspace code (12 Nov 2026). */
const accountLoggedOut = document.getElementById("accountLoggedOut");
const accountLoggedIn = document.getElementById("accountLoggedIn");
const accEmail = document.getElementById("accEmail");
const accPassword = document.getElementById("accPassword");
const accLoginBtn = document.getElementById("accLogin");
const accLogoutBtn = document.getElementById("accLogout");
const accEmailText = document.getElementById("accEmailText");

async function refreshAccount() {
  const res = await chrome.runtime
    .sendMessage({ type: "APPLYTRACK_GET_SESSION" })
    .catch(() => null);
  const session = res?.session ?? null;
  accountLoggedOut.hidden = Boolean(session);
  accountLoggedIn.hidden = !session;
  if (session) accEmailText.textContent = session.email ?? "Logged in";
}
refreshAccount();

accLoginBtn.addEventListener("click", async () => {
  const email = accEmail.value.trim();
  const password = accPassword.value;
  if (!email || !password) {
    saved.textContent = "Enter your email and password.";
    return;
  }
  accLoginBtn.disabled = true;
  try {
    const base = apiUrl.value.trim().replace(/\/$/, "") || DEFAULTS.apiUrl;
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      throw new Error(data.error || `Login failed (HTTP ${res.status})`);
    }
    await chrome.storage.local.set({
      sessionToken: data.token,
      sessionEmail: data.user?.email ?? email,
      sessionApiUrl: base,
    });
    accPassword.value = "";
    saved.textContent = "Logged in ✓";
    await refreshAccount();
    setTimeout(() => (saved.textContent = ""), 2000);
  } catch (err) {
    saved.textContent = String(err.message || err);
  } finally {
    accLoginBtn.disabled = false;
  }
});

accLogoutBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "APPLYTRACK_LOGOUT" }).catch(() => undefined);
  saved.textContent = "Logged out.";
  await refreshAccount();
  setTimeout(() => (saved.textContent = ""), 2000);
});

document.getElementById("save").addEventListener("click", () => {
  const apiUrlValue = apiUrl.value.trim().replace(/\/$/, "");
  chrome.storage.sync.set(
    {
      apiUrl: apiUrlValue,
      apiKey: apiKey.value.trim(),
      autoCapture: autoCapture.checked,
    },
    () => {
      saved.textContent = "Saved ✓";
      setTimeout(() => (saved.textContent = ""), 2000);
    },
  );
});
