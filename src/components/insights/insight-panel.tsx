"use client";

import { useState } from "react";
import { FileText, Lightbulb, RefreshCw, Target } from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

export type Report = {
  title: string;
  summary: string;
  insights: string[];
  recommendations: string[];
  generatedBy: "llm" | "rules";
  createdAt?: string;
};

export function InsightPanel({
  initialReport,
}: {
  initialReport: Report | null;
}) {
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(initialReport);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/report", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { report: Report };
      setReport(data.report);
      toast("New report generated");
    } catch {
      toast("Failed to generate report", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-3.5 text-xs text-brand-800 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Reports are built from your own application data — statuses,
          timelines, and platforms — so you can see what to do next.
        </p>
        <button className="btn-primary shrink-0 !px-3 !py-1.5 !text-xs" onClick={generate} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Analyzing…" : "Generate report"}
        </button>
      </div>

      {!report ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <Lightbulb className="h-8 w-8 text-brand-400" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            No report yet
          </h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Generate your first report to see personalized insights and
            recommendations.
          </p>
          <button className="btn-primary mt-4" onClick={generate} disabled={loading}>
            {loading ? "Analyzing…" : "Generate report"}
          </button>
        </div>
      ) : (
        <>
          <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <h1 className="text-base font-bold text-slate-900">{report.title}</h1>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  {report.generatedBy === "llm" ? "Full report" : "Quick report"}
                  {report.createdAt &&
                    ` · ${new Date(report.createdAt).toLocaleString("en-GB")}`}
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {report.summary}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Lightbulb className="h-4 w-4 text-amber-500" /> Insights
              </h2>
              <ul className="space-y-2.5">
                {report.insights.map((item, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Target className="h-4 w-4 text-emerald-500" /> Recommendations
              </h2>
              {report.recommendations.length ? (
                <ol className="space-y-2.5">
                  {report.recommendations.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700">
                        {i + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">No recommendations yet.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
