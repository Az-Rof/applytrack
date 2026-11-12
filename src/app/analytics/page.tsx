import { requireUser } from "@/lib/auth";
import {
  getApplicationsPerMonth,
  getConversionFunnel,
  getMetrics,
  getPlatformPerformance,
  getStatusDistribution,
} from "@/lib/services/analytics";
import { PageHeader, StatCard } from "@/components/ui/primitives";
import { ApplicationsChart } from "@/components/charts/applications-chart";
import { PlatformChart } from "@/components/charts/platform-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { StatusPie } from "@/components/charts/status-pie";
import { toPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireUser();

  const [metrics, monthly, platforms, funnel, distribution] = await Promise.all([
    getMetrics(user.id),
    getApplicationsPerMonth(user.id, 12),
    getPlatformPerformance(user.id),
    getConversionFunnel(user.id),
    getStatusDistribution(user.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Conversion funnels, platform effectiveness and trends."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Interview rate"
          value={toPercent(metrics.interviewRate)}
          hint={`${metrics.totalInterviews} of ${metrics.totalApplications}`}
          accent="text-indigo-600"
        />
        <StatCard
          label="Offer rate"
          value={toPercent(metrics.offerRate)}
          hint={`${metrics.totalOffers} offers`}
          accent="text-emerald-600"
        />
        <StatCard
          label="Response rate"
          value={toPercent(metrics.responseRate)}
          hint="Advanced past Applied"
          accent="text-sky-600"
        />
        <StatCard
          label="Rejections"
          value={metrics.totalRejections}
          hint={`${metrics.totalTechnicalTests} technical tests`}
          accent="text-rose-600"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Conversion funnel</h2>
          <p className="mb-4 text-xs text-slate-500">
            Applications that reached each stage
          </p>
          <FunnelChart data={funnel} />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Status distribution</h2>
          <p className="mb-4 text-xs text-slate-500">Current status of all applications</p>
          <StatusPie data={distribution} />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Applications per month</h2>
          <p className="mb-4 text-xs text-slate-500">Last 12 months</p>
          <ApplicationsChart data={monthly} />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Platform performance</h2>
          <p className="mb-4 text-xs text-slate-500">
            Interview conversion rate per platform
          </p>
          {platforms.length ? (
            <>
              <PlatformChart
                data={platforms.map((p) => ({
                  platform: p.platform,
                  interviewRate: Math.round(p.interviewRate * 100),
                  applications: p.applications,
                }))}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="pb-2 font-semibold">Platform</th>
                      <th className="pb-2 font-semibold">Apps</th>
                      <th className="pb-2 font-semibold">Interviews</th>
                      <th className="pb-2 font-semibold">Offers</th>
                      <th className="pb-2 font-semibold">Interview rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {platforms.map((p) => (
                      <tr key={p.platform} className="text-slate-700">
                        <td className="py-2 font-medium">{p.platform}</td>
                        <td className="py-2">{p.applications}</td>
                        <td className="py-2">{p.interviews}</td>
                        <td className="py-2">{p.offers}</td>
                        <td className="py-2 font-semibold text-brand-700">
                          {toPercent(p.interviewRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">No data yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
