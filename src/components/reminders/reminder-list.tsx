"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CalendarClock, Check, RefreshCw, X } from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { formatDate, cn } from "@/lib/utils";

type Reminder = {
  id: string;
  type: string;
  status: "PENDING" | "DONE" | "DISMISSED";
  dueAt: string | Date;
  message: string;
  application: {
    id: string;
    jobTitle: string;
    companyName: string;
    platform: string;
  };
};

export function ReminderList({ reminders }: { reminders: Reminder[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  async function resolve(id: string, status: "DONE" | "DISMISSED") {
    setBusy(id);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", id, status }),
      });
      if (!res.ok) throw new Error();
      toast(status === "DONE" ? "Marked as done" : "Dismissed");
      router.refresh();
    } catch {
      toast("Failed to update reminder", "error");
    } finally {
      setBusy(null);
    }
  }

  async function scan() {
    setScanning(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
      });
      const data = await res.json();
      toast(
        data.created > 0
          ? `${data.created} new follow-up reminder(s) created`
          : "No stale applications found — you're up to date!",
      );
      router.refresh();
    } catch {
      toast("Scan failed", "error");
    } finally {
      setScanning(false);
    }
  }

  const pending = reminders.filter((r) => r.status === "PENDING");
  const resolved = reminders.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-secondary" onClick={scan} disabled={scanning}>
          <RefreshCw className={cn("h-4 w-4", scanning && "animate-spin")} />
          Scan for stale applications
        </button>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Bell className="h-4 w-4 text-amber-500" /> Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Nothing pending. Follow-up reminders are created automatically when an
            application has had no update for 14 days.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/applications/${r.application.id}`}
                    className="text-sm font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {r.application.jobTitle} · {r.application.companyName}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-600">{r.message}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <CalendarClock className="h-3 w-3" /> Due {formatDate(r.dueAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-secondary !px-3 !py-1.5 !text-xs"
                    onClick={() => resolve(r.id, "DONE")}
                    disabled={busy === r.id}
                  >
                    <Check className="h-3.5 w-3.5" /> Done
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-1.5 !text-xs"
                    onClick={() => resolve(r.id, "DISMISSED")}
                    disabled={busy === r.id}
                  >
                    <X className="h-3.5 w-3.5" /> Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Resolved ({resolved.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {resolved.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2 text-sm text-slate-500"
              >
                <span className="truncate">
                  {r.application.jobTitle} · {r.application.companyName}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide">
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
