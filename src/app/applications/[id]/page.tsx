import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getApplication } from "@/lib/services/applications";
import { StatusBadge } from "@/components/ui/status-badge";
import { JobFlagBadges } from "@/components/ui/job-flag-badge";
import { DeleteButton, StatusChanger } from "@/components/applications/status-changer";
import { formatDateTime, daysAgo } from "@/lib/utils";
import {
  progressPercent,
  STATUS_LABEL,
  isTerminal,
  type ApplicationStatus,
} from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const app = await getApplication(user.id, id);
  if (!app) notFound();

  const percent = progressPercent(app.status as ApplicationStatus);
  const stale = daysAgo(app.lastStatusChangeAt);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/applications"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to applications
      </Link>

      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {app.jobTitle}
              </h1>
              <StatusBadge status={app.status as ApplicationStatus} />
              <JobFlagBadges jobClosed={app.jobClosed} jobFlag={app.jobFlag} />
              {app.source === "EXTENSION" && (
                <span className="badge bg-brand-50 text-brand-700 ring-brand-100">
                  Auto-captured
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {app.companyName} · {app.platform}
              {app.location ? ` · ${app.location}` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Applied {formatDateTime(app.appliedAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/applications/${app.id}/edit`} className="btn-secondary">
              Edit
            </Link>
            <DeleteButton applicationId={app.id} />
          </div>
        </div>

        {/* Progress */}
        <div className="mt-6">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                app.status === "REJECTED"
                  ? "bg-rose-400"
                  : app.status === "ACCEPTED"
                    ? "bg-emerald-500"
                    : "bg-brand-500"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          {!isTerminal(app.status as ApplicationStatus) && stale >= 14 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No update for {stale} days — consider following up with the recruiter.
            </p>
          )}
        </div>

        {/* Meta grid */}
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Meta label="Employment" value={app.employmentType ?? "—"} />
          <Meta label="Salary" value={app.salary ?? "—"} />
          <Meta label="Last change" value={formatDateTime(app.lastStatusChangeAt)} />
          <Meta
            label="Job URL"
            value={
              app.jobUrl ? (
                <a
                  href={app.jobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                >
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                "—"
              )
            }
          />
        </dl>

        <div className="mt-6">
          <p className="label">Update status</p>
          <StatusChanger
            applicationId={app.id}
            current={app.status as ApplicationStatus}
          />
        </div>

        {app.notes && (
          <div className="mt-6">
            <p className="label">Notes</p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {app.notes}
            </p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="card mt-4 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">Status history</h2>
        <ol className="mt-4 space-y-4">
          {app.statusHistory.map((h, idx) => (
            <li key={h.id} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    idx === 0 ? "bg-brand-500 ring-4 ring-brand-100" : "bg-slate-300"
                  }`}
                />
                {idx < app.statusHistory.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-slate-200" />
                )}
              </div>
              <div className="pb-1">
                <p className="text-sm font-medium text-slate-800">
                  {h.oldStatus
                    ? `${STATUS_LABEL[h.oldStatus as ApplicationStatus]} → ${
                        STATUS_LABEL[h.newStatus as ApplicationStatus]
                      }`
                    : STATUS_LABEL[h.newStatus as ApplicationStatus]}
                </p>
                <p className="text-xs text-slate-500">{formatDateTime(h.changedAt)}</p>
                {h.note && <p className="mt-0.5 text-xs text-slate-500">{h.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value}</dd>
    </div>
  );
}
