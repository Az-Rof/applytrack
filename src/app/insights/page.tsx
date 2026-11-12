import { requireUser } from "@/lib/auth";
import { getLatestReport } from "@/lib/agent/insights";
import { PageHeader } from "@/components/ui/primitives";
import { InsightPanel } from "@/components/insights/insight-panel";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const user = await requireUser();
  const report = await getLatestReport(user.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Insights"
        description="Your search, summarized — what happened, and what to do next."
      />
      <InsightPanel
        initialReport={report ? JSON.parse(JSON.stringify(report)) : null}
      />
    </div>
  );
}
