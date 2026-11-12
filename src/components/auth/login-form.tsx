"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";

const DEMO_EMAIL = "demo@applytrack.dev";
const DEMO_PASSWORD = "demo12345";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<null | "login" | "register" | "demo">(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: "login" | "register" | "demo") {
    setBusy(kind);
    setError(null);
    try {
      const body =
        kind === "demo"
          ? { email: DEMO_EMAIL, password: DEMO_PASSWORD }
          : {
              email,
              password,
              ...(kind === "register" && name.trim()
                ? { name: name.trim() }
                : {}),
            };

      const res = await fetch(`/api/auth/${kind === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");

      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div className="card w-full max-w-sm p-6 sm:p-8">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-bold text-white shadow-md shadow-brand-500/30">
          AT
        </span>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          ApplyTrack
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Log in with your email and password."
            : "Create your account — one email, one password."}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
        <button
          type="button"
          className={
            mode === "login"
              ? "rounded-lg bg-white py-1.5 text-slate-900 shadow-sm"
              : "rounded-lg py-1.5 text-slate-500"
          }
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Log in
        </button>
        <button
          type="button"
          className={
            mode === "register"
              ? "rounded-lg bg-white py-1.5 text-slate-900 shadow-sm"
              : "rounded-lg py-1.5 text-slate-500"
          }
          onClick={() => {
            setMode("register");
            setError(null);
          }}
        >
          Register
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(mode);
        }}
        className="space-y-3"
      >
        {mode === "register" && (
          <input
            className="input"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
        />
        <input
          className="input"
          type="password"
          placeholder={mode === "register" ? "Password (min. 8 characters)" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 8 : undefined}
          required
        />

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy !== null}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === "register" ? (
            <UserPlus className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {mode === "register" ? "Create account" : "Log in"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        className="btn-ghost w-full text-xs"
        onClick={() => void submit("demo")}
        disabled={busy !== null}
      >
        {busy === "demo" ? "Loading…" : "Try the demo account (sample data)"}
      </button>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
        Your account is identified by its id — the email is only used to log
        in. Demo account: demo@applytrack.dev / demo12345 (seeded sample
        data; delete it in production).
      </p>
    </div>
  );
}
