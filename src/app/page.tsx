import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  Percent,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getApplicationsPerMonth,
  getMetrics,
  getPlatformPerformance,
} from "@/lib/services/analytics";
import { listApplications } from "@/lib/services/applications";
import { listReminders } from "@/lib/services/reminders";
import { StatCard, EmptyState } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { JobFlagBadges } from "@/components/ui/job-flag-badge";
import { formatDate, toPercent } from "@/lib/utils";
import { ApplicationsChart } from "@/components/charts/applications-chart";
import { PlatformChart } from "@/components/charts/platform-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [metrics, monthly, platforms, recent, reminders] = await Promise.all([
    getMetrics(user.id),
    getApplicationsPerMonth(user.id, 6),
    getPlatformPerformance(user.id),
    listApplications(user.id, { take: 6 }),
    listReminders(user.id),
  ]);

  const pendingReminders = reminders.filter((r) => r.status === "PENDING");

  return (
    <div>
      {/* Hero band — replaces the plain page header. */}
      <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-brand-800 to-violet-700 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-200">
              Dashboard
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Pencarian kerjamu, dalam satu tempat.
            </h1>
            <p className="mt-1 max-w-lg text-sm text-indigo-100/90">
              {metrics.totalApplications} lamaran tercatat ·{" "}
              {metrics.totalInterviews} interview · {pendingReminders.length}{" "}
              pengingat menunggu.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/sync"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
              Sync now
            </Link>
            <Link href="/reminders" className="btn-secondary !border-0">
              <CalendarClock className="h-4 w-4" />
              Reminders
              {pendingReminders.length > 0 && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                  {pendingReminders.length}
                </span>
              )}
            </Link>
            <Link href="/applications/new" className="btn-primary">
              Add Application
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Applications"
          value={metrics.totalApplications}
          hint={`${metrics.thisMonthApplications} this month`}
          icon={<BriefcaseBusiness className="h-5 w-5" />}
        />
        <StatCard
          label="Interviews"
          value={metrics.totalInterviews}
          hint={`${toPercent(metrics.interviewRate)} interview rate`}
          accent="text-indigo-600"
          icon={<Percent className="h-5 w-5" />}
        />
        <StatCard
          label="Offers"
          value={metrics.totalOffers}
          hint={`${toPercent(metrics.offerRate)} offer rate`}
          accent="text-emerald-600"
          icon={<Trophy className="h-5 w-5" />}
        />
        <StatCard
          label="Active"
          value={metrics.activeApplications}
          hint={`${metrics.totalRejections} rejected`}
          accent="text-sky-600"
          icon={<ArrowUpRight className="h-5 w-5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Applications per month
          </h2>
          <p className="mb-4 text-xs text-slate-500">Last 6 months</p>
          <ApplicationsChart data={monthly} />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Platform performance</h2>
          <p className="mb-4 text-xs text-slate-500">Interview rate by platform</p>
          {platforms.length ? (
            <PlatformChart
              data={platforms.map((p) => ({
                platform: p.platform,
                interviewRate: Math.round(p.interviewRate * 100),
                applications: p.applications,
              }))}
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">No data yet.</p>
          )}
        </section>
      </div>

      <section className="card mt-4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recent applications</h2>
          <Link
            href="/applications"
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            View all →
          </Link>
        </div>

        {recent.items.length === 0 ? (
          <EmptyState
            title="No applications yet"
            description="Add your first application manually, or install the Chrome extension to capture them automatically."
            action={
              <Link href="/applications/new" className="btn-primary">
                Add Application
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.items.map((app) => (
              <Link
                key={app.id}
                href={`/applications/${app.id}`}
                className="flex items-center gap-3 py-3 transition hover:opacity-80"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {app.jobTitle}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {app.companyName} · {app.platform}
                    {app.source === "EXTENSION" && (
                      <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                        AUTO
                      </span>
                    )}
                  </p>
                </div>
                <span className="hidden text-xs text-slate-500 sm:block">
                  {formatDate(app.appliedAt)}
                </span>
                <StatusBadge status={app.status} />
                <JobFlagBadges
                  jobClosed={app.jobClosed}
                  jobFlag={app.jobFlag}
                  className="hidden lg:inline-flex"
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
