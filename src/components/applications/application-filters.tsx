"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { PLATFORMS, STATUS_LABEL } from "@/lib/status";

export function ApplicationFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      startTransition(() => router.push(`/applications?${next.toString()}`));
    },
    [params, router],
  );

  return (
    <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update("q", q);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search job title or company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-slate-400">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <select
          className="input w-auto min-w-[130px]"
          value={params.get("platform") ?? ""}
          onChange={(e) => update("platform", e.target.value)}
        >
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="input w-auto min-w-[130px]"
          value={params.get("status") ?? ""}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input w-auto"
          value={params.get("from") ?? ""}
          onChange={(e) => update("from", e.target.value)}
          aria-label="From date"
        />
        <input
          type="date"
          className="input w-auto"
          value={params.get("to") ?? ""}
          onChange={(e) => update("to", e.target.value)}
          aria-label="To date"
        />
      </div>
      {isPending && <span className="text-xs text-slate-400">Loading…</span>}
    </div>
  );
}
