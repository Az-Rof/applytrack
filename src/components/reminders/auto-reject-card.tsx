"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";

/**
 * Menu for the per-user auto-reject rule: "no status change for N days
 * → automatically Rejected". Saved on the server, applied on reminders page
 * loads and during every Glints sync — plus a manual
 * "Apply now" button here.
 */
export function AutoRejectCard() {
  const router = useRouter();
  const { toast } = useToast();
  const [days, setDays] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
  const [lastApply, setLastApply] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/auto-reject");
        if (res.ok) {
          const data = (await res.json()) as { autoRejectDays: number | null };
          setDays(data.autoRejectDays);
          if (data.autoRejectDays) setInput(String(data.autoRejectDays));
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function save() {
    const parsed = input.trim() === "" ? null : Number(input);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 365)) {
      toast("Enter a number of days between 1 and 365 (or leave empty to turn off)", "error");
      return;
    }
    setBusy("save");
    try {
      const res = await fetch("/api/settings/auto-reject", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: parsed }),
      });
      const data = (await res.json()) as { autoRejectDays?: number | null; error?: string };
      if (!res.ok) {
        toast(data.error ?? "Could not save the rule", "error");
        return;
      }
      setDays(data.autoRejectDays ?? null);
      toast(
        data.autoRejectDays
          ? `Auto-reject enabled: ${data.autoRejectDays} day${data.autoRejectDays === 1 ? "" : "s"} without status change`
          : "Auto-reject disabled",
        "success",
      );
      router.refresh();
    } catch {
      toast("Network error — is the server running?", "error");
    } finally {
      setBusy(null);
    }
  }

  async function applyNow() {
    setBusy("apply");
    setLastApply(null);
    try {
      const res = await fetch("/api/settings/auto-reject", { method: "POST" });
      const data = (await res.json()) as { rejected?: number; days?: number | null; error?: string };
      if (!res.ok) {
        toast(data.error ?? "Could not apply the rule", "error");
        return;
      }
      if (!data.days) {
        toast("Enable the rule first (set a number of days)", "error");
        return;
      }
      setLastApply(
        data.rejected
          ? `${data.rejected} application${data.rejected === 1 ? "" : "s"} marked Rejected`
          : "Nothing to auto-reject right now",
      );
      toast(`${data.rejected} auto-rejected`, "success");
      router.refresh();
    } catch {
      toast("Network error — is the server running?", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Auto-reject quiet applications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Applications that haven&apos;t had <em>any</em> status change for more than the number of
          days below (since applying or the last update) are automatically marked{" "}
          <span className="badge bg-rose-100 text-rose-700 ring-rose-200">Rejected</span> with a
          history note. Offer stage and beyond are never auto-rejected. The rule runs when this
          page loads, during every Glints sync — and you can apply it
          manually anytime.
        </p>
      </div>

      {loaded && (
        <p className="text-xs text-slate-500">
          Currently:{" "}
          {days ? (
            <span className="font-semibold text-slate-700">
              enabled — {days} day{days === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="font-semibold text-slate-700">disabled</span>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label className="label" htmlFor="autoRejectDays">
            Days without change
          </label>
          <input
            id="autoRejectDays"
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            className="input"
            placeholder="e.g. 30"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy !== null}
            onClick={() => void save()}
          >
            {busy === "save" ? "Saving…" : "Save rule"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() => void applyNow()}
          >
            {busy === "apply" ? "Applying…" : "Apply now"}
          </button>
        </div>
      </div>

      {lastApply && <p className="text-xs text-slate-500">{lastApply}</p>}
    </div>
  );
}
