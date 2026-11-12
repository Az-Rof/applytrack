import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/services/applications";
import { ApplicationFilters } from "@/components/applications/application-filters";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { JobFlagBadges } from "@/components/ui/job-flag-badge";
import { formatDate } from "@/lib/utils";
import type { ApplicationStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const { items, total } = await listApplications(user.id, {
    q: get("q"),
    platform: get("platform"),
    status: get("status") as ApplicationStatus | undefined,
    from: get("from"),
    to: get("to"),
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Applications"
        description={`${total} application${total === 1 ? "" : "s"} tracked`}
        actions={
          <Link href="/applications/new" className="btn-primary">
            Add Application
          </Link>
        }
      />

      <ApplicationFilters />

      {items.length === 0 ? (
        <EmptyState
          title="No applications found"
          description="Try adjusting the filters, or add a new application."
          action={
            <Link href="/applications/new" className="btn-primary">
              Add Application
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Position</span>
            <span>Platform</span>
            <span>Applied</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {items.map((app) => (
              <li key={app.id} className="relative">
                <Link
                  href={`/applications/${app.id}`}
                  className="grid gap-1 py-3.5 pl-5 pr-14 transition hover:bg-slate-50 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {app.jobTitle}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {app.companyName}
                      {app.location ? ` · ${app.location}` : ""}
                      {app.source === "EXTENSION" && (
                        <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                          AUTO
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-slate-600">{app.platform}</span>
                  <span className="text-xs text-slate-600">
                    {formatDate(app.appliedAt)}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={app.status} />
                    <JobFlagBadges jobClosed={app.jobClosed} jobFlag={app.jobFlag} />
                  </div>
                  <span className="hidden text-xs font-semibold text-brand-600 md:block">
                    View →
                  </span>
                </Link>
                {app.jobUrl && (
                  <a
                    href={app.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open job posting"
                    aria-label={`Open job posting for ${app.jobTitle}`}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
