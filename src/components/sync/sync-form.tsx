"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toaster";
import { STATUS_LABEL, STATUS_STYLE, type ApplicationStatus } from "@/lib/status";
import { mapPlatformStatus, type PlatformName } from "@/lib/import/platform";
import { JobFlagBadges } from "@/components/ui/job-flag-badge";
import { cn } from "@/lib/utils";

type ImportedRow = {
  externalId: string;
  platform?: string;
  platformStatus: string;
  jobTitle: string;
  companyName: string;
  location: string | null;
  appliedAt: string;
  jobUrl: string;
  timelineSteps: number;
  jobClosed?: boolean;
  jobFlag?: string | null;
  // Legacy field name still returned by older captures:
  glintsStatus?: string;
};

type SyncSummaryData = {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicts: Array<{
    externalId: string;
    platform?: string;
    jobTitle: string;
    companyName: string;
    platformStatus?: string;
    glintsStatus?: string;
    localStatus: string;
    reason?: "manual" | "auto-reject";
  }>;
};

type LivePullInfo = {
  used: boolean;
  source?: string;
  note?: string;
  fetched?: { list: number; details: number; companies: number };
};

type SyncResultView = {
  summary: SyncSummaryData;
  livePull: LivePullInfo;
  imported: ImportedRow[];
  platformNotes?: Array<{ platform: string; ok: boolean; text: string }>;
};

/** Anything the sync could return, wrapped into what SyncResult renders. */
type SyncEndpointResponse = Partial<{
  summary: SyncSummaryData;
  livePull: LivePullInfo;
  imported: ImportedRow[];
  counts: { list: number; details: number; companies: number };
  sessionValid: boolean;
  source: string;
}> & { error?: string; note?: string };

/**
 * Sync page — TANPA cookie (12 Nov 2026).
 *
 * Fetch lowongan yang di-apply HANYA jalan di dalam browser user lewat
 * extension (konsep awal project ini). Dulu ada tombol "Sync Glints" di
 * halaman ini yang menarik data dari server pakai cookie Glints tersimpan
 * — itu dihapus: server ApplyTrack tidak pernah menerima atau menyimpan
 * cookie sesi Glints. Yang tersisa di halaman ini: petunjuk sync lewat
 * extension + import HAR offline (yang juga hanya membaca isi respons
 * API di dalam file HAR, bukan cookie).
 */
export function SyncWorkspace() {
  const [result, setResult] = useState<SyncResultView | null>(null);

  return (
    <div className="space-y-6">
      {/* 1) Sync — extension only ---------------------------------------- */}
      <div className="card space-y-3 overflow-hidden">
        <div className="bg-gradient-to-r from-ink-900 via-brand-800 to-violet-700 px-5 py-4 text-white sm:px-6">
          <h2 className="text-base font-semibold">Sync Glints</h2>
          <p className="mt-0.5 text-xs text-indigo-100/90">
            One click in the extension — no Glints cookie is ever stored on
            this server.
          </p>
        </div>
        <div className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
            <li>
              Log in to <strong className="text-slate-800">glints.com</strong> in
              this browser and open your My Applications page.
            </li>
            <li>
              Open the ApplyTrack extension popup (log in there once with your
              ApplyTrack email + password) and press{" "}
              <em>Sync Glints applications</em>.
            </li>
            <li>
              The extension pulls every application + status timeline{" "}
              <strong className="text-slate-800">inside your browser</strong> and
              sends only the raw payloads here — your Glints session cookie
              never leaves your browser.
            </li>
          </ol>
          <p className="text-xs leading-relaxed text-slate-500">
            Sync is idempotent — rows are matched by their platform
            application/job ID, so re-running never duplicates. If Glints
            answers 401 in the extension, just log in to glints.com again
            and press Sync.
          </p>
        </div>
      </div>

      {/* 2) Result ---------------------------------------------------------- */}
      {result && <SyncResult result={result} />}

      {/* 3) HAR fallback -------------------------------------------------- */}
      <details className="card p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          Import from a .har capture (offline fallback)
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Use this when you already exported a HAR from glints.com and
          don&apos;t want to use the extension — only the API response
          bodies inside the file are read, never any cookie.
        </p>
        <div className="mt-4">
          <HARImportForm onResult={setResult} />
        </div>
      </details>
    </div>
  );
}

export function HARImportForm({
  onResult,
}: {
  onResult: (data: SyncResultView) => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setRunning(true);

    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/sync/har", { method: "POST", body: fd });
      const raw = (await res.json()) as SyncEndpointResponse;
      if (!res.ok) {
        toast(raw.error ?? "Import failed", "error");
        return;
      }
      toast(
        `Import complete: ${raw.summary?.created ?? 0} new, ${raw.summary?.updated ?? 0} updated`,
        "success",
      );
      onResult(normalizeHarResult(raw));
    } catch {
      toast("Network error", "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="file"
        accept=".har,application/json"
        className="input"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        required
      />
      <div className="flex justify-end">
        <button type="submit" className="btn-secondary" disabled={!file || running}>
          {running ? "Importing…" : "Import HAR"}
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- result */

/** Map the HAR endpoint's response into the shared, richer display shape. */
export function normalizeHarResult(data: SyncEndpointResponse): SyncResultView {
  return {
    summary: data.summary ?? { scanned: 0, created: 0, updated: 0, unchanged: 0, conflicts: [] },
    livePull: data.livePull ?? { used: false },
    imported: data.imported ?? [],
  };
}

function SyncResult({ result }: { result: SyncResultView }) {
  const { summary, livePull, imported, platformNotes } = result;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Created" value={summary.created} accent="text-emerald-600" />
        <Stat label="Updated" value={summary.updated} accent="text-brand-600" />
        <Stat label="Unchanged" value={summary.unchanged} />
        <Stat
          label="Conflicts"
          value={summary.conflicts.length}
          accent={summary.conflicts.length ? "text-amber-600" : "text-slate-900"}
        />
      </div>

      {platformNotes && platformNotes.length > 0 && (
        <ul className="space-y-1.5">
          {platformNotes.map((note) => (
            <li
              key={`${note.platform}-${note.text}`}
              className={cn(
                "rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed",
                note.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700",
              )}
            >
              {note.text}
            </li>
          ))}
        </ul>
      )}

      {(livePull.source || livePull.note) && (
        <p
          className={cn(
            "rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed",
            livePull.used
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {livePull.used
            ? `Live data from ${livePull.source ?? "the platform"}${fetchedText(livePull.fetched)}`
            : livePull.note}
        </p>
      )}

      {imported.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Applied</th>
                <th className="px-4 py-2.5 font-semibold">Job</th>
                <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Company</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">
                  History
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imported.map((row) => {
                const rawStatus = row.platformStatus ?? row.glintsStatus ?? "";
                const status = mapPlatformStatus(
                  (row.platform as PlatformName) ?? "Glints",
                  rawStatus,
                );
                return (
                  <tr key={row.externalId} className="text-slate-700">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                      {new Date(row.appliedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={row.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-slate-900 hover:text-brand-600"
                      >
                        {row.jobTitle}
                      </a>
                      <p className="text-xs text-slate-500">
                        {row.location ?? "—"}
                        {row.platform ? ` · ${row.platform}` : ""}
                      </p>
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">{row.companyName}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={cn("badge", STATUS_STYLE[status as ApplicationStatus])}>
                          {STATUS_LABEL[status as ApplicationStatus] ?? rawStatus}
                        </span>
                        <JobFlagBadges jobClosed={row.jobClosed} jobFlag={row.jobFlag} />
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-xs text-slate-500 sm:table-cell">
                      {row.timelineSteps || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {summary.conflicts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-800">Status conflicts (local status kept)</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-700">
            {summary.conflicts.map((c) => (
              <li key={c.externalId}>
                {c.jobTitle} @ {c.companyName}: {c.platform ?? "the platform"} says{" "}
                <strong>{c.platformStatus ?? c.glintsStatus}</strong>, local stays{" "}
                <strong>{STATUS_LABEL[c.localStatus as ApplicationStatus] ?? c.localStatus}</strong>
                {c.reason === "auto-reject" ? " (kept by auto-reject rule)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function fetchedText(fetched?: { list: number; details: number; companies: number }): string {
  if (!fetched) return ".";
  const parts = [
    `${fetched.list} application${fetched.list === 1 ? "" : "s"}`,
    fetched.details ? `${fetched.details} status timelines` : "",
    fetched.companies ? `${fetched.companies} companies` : "",
  ].filter(Boolean);
  return parts.length ? ` — ${parts.join(", ")}.` : ".";
}

function Stat({
  label,
  value,
  accent = "text-slate-900",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold", accent)}>{value}</p>
    </div>
  );
}
