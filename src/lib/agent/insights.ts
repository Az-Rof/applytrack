import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getApplicationsPerMonth,
  getConversionFunnel,
  getMetrics,
  getPlatformPerformance,
} from "@/lib/services/analytics";
import { getOpenAI } from "@/lib/agent/extract";
import { toPercent } from "@/lib/utils";

type InsightReport = {
  title: string;
  summary: string;
  insights: string[];
  recommendations: string[];
  generatedBy: "llm" | "rules";
};

type Snapshot = {
  metrics: Awaited<ReturnType<typeof getMetrics>>;
  platforms: Awaited<ReturnType<typeof getPlatformPerformance>>;
  monthly: Awaited<ReturnType<typeof getApplicationsPerMonth>>;
  funnel: Awaited<ReturnType<typeof getConversionFunnel>>;
};

async function buildSnapshot(userId: string): Promise<Snapshot> {
  const [metrics, platforms, monthly, funnel] = await Promise.all([
    getMetrics(userId),
    getPlatformPerformance(userId),
    getApplicationsPerMonth(userId, 6),
    getConversionFunnel(userId),
  ]);
  return { metrics, platforms, monthly, funnel };
}

function buildRuleBasedInsights(s: Snapshot): InsightReport {
  const insights: string[] = [];
  const recommendations: string[] = [];
  const { metrics, platforms, monthly, funnel } = s;

  // Volume trend
  const trend = metrics.thisMonthApplications - metrics.lastMonthApplications;
  insights.push(
    trend >= 0
      ? `You applied to ${metrics.thisMonthApplications} jobs this month, ${trend} more than last month.`
      : `You applied to ${metrics.thisMonthApplications} jobs this month, ${Math.abs(trend)} fewer than last month.`,
  );

  // Rates vs. healthy benchmarks (rough industry ballparks)
  if (metrics.totalApplications > 0) {
    if (metrics.interviewRate < 0.1) {
      insights.push(
        `Interview rate is ${toPercent(metrics.interviewRate)} — below the ~10-20% typical range.`,
      );
      recommendations.push(
        "Tailor your CV and cover letter to each job description; generic applications rarely pass screening.",
      );
    } else {
      insights.push(
        `Interview rate is ${toPercent(metrics.interviewRate)} — solid for an active search.`,
      );
    }
    if (metrics.offerRate > 0) {
      insights.push(`Offer rate is ${toPercent(metrics.offerRate)} across ${metrics.totalApplications} applications.`);
    }
  }

  // Best platform
  if (platforms.length > 1) {
    const best = [...platforms].sort(
      (a, b) => b.interviewRate - a.interviewRate || b.applications - a.applications,
    )[0];
    if (best.interviewRate > 0) {
      insights.push(
        `${best.platform} converts best: ${toPercent(best.interviewRate)} interview rate over ${best.applications} applications.`,
      );
      recommendations.push(`Prioritize ${best.platform} for future applications.`);
    }
    const worst = platforms.filter((p) => p.applications >= 3).sort(
      (a, b) => a.interviewRate - b.interviewRate,
    )[0];
    if (worst && worst.platform !== best.platform && worst.interviewRate < best.interviewRate) {
      recommendations.push(
        `Reduce time on ${worst.platform} (${toPercent(worst.interviewRate)} interview rate) until your CV is optimized for it.`,
      );
    }
  }

  // Funnel drop-off
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1];
    const cur = funnel[i];
    if (prev.count >= 3) {
      const drop = prev.count ? 1 - cur.count / prev.count : 0;
      if (drop >= 0.6) {
        insights.push(
          `Biggest drop-off: ${prev.label} → ${cur.label} (${toPercent(drop)} of applications stop here).`,
        );
        recommendations.push(
          cur.stage === "HR_SCREENING"
            ? "Improve your resume keywords so it passes recruiter/ATS screening."
            : cur.stage === "INTERVIEW"
              ? "Practice common interview questions and prepare STAR stories about your projects."
              : `Focus on preparing for the ${cur.label} stage.`,
        );
        break;
      }
    }
  }

  // Activity streak
  const activeMonths = monthly.filter((m) => m.applications > 0).length;
  if (metrics.totalApplications > 0 && activeMonths <= 1) {
    recommendations.push("Apply consistently (3-5 quality applications per week) instead of batching.");
  }

  if (!insights.length) insights.push("Not enough data yet — add more applications to unlock insights.");

  return {
    title: `Job Search Report — ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`,
    summary: `You have ${metrics.totalApplications} total applications, ${metrics.totalInterviews} interviews, ${metrics.totalOffers} offers and ${metrics.totalRejections} rejections. ${metrics.activeApplications} applications are still in progress.`,
    insights,
    recommendations: recommendations.slice(0, 4),
    generatedBy: "rules",
  };
}

export async function generateInsightsReport(
  userId: string,
  options: { persist?: boolean } = {},
): Promise<InsightReport> {
  const snapshot = await buildSnapshot(userId);
  const rules = buildRuleBasedInsights(snapshot);
  const openai = getOpenAI();

  let report = rules;

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "You are ApplyTrack Agent, a career analytics coach. Analyse job-search data and produce concise, actionable insights. Be specific and reference numbers. No fluff. Respond as JSON: {summary, insights: string[], recommendations: string[]}.",
          },
          {
            role: "user",
            content: JSON.stringify({
              metrics: snapshot.metrics,
              platforms: snapshot.platforms,
              monthly: snapshot.monthly,
              funnel: snapshot.funnel,
            }),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      const raw = response.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          summary?: string;
          insights?: string[];
          recommendations?: string[];
        };
        report = {
          title: rules.title,
          summary: parsed.summary || rules.summary,
          insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 6) : rules.insights,
          recommendations: Array.isArray(parsed.recommendations)
            ? parsed.recommendations.slice(0, 5)
            : rules.recommendations,
          generatedBy: "llm",
        };
      }
    } catch (err) {
      console.error("[agent] insight generation failed, using rules", err);
    }
  }

  if (options.persist !== false) {
    await prisma.report.create({
      data: {
        userId,
        type: "ON_DEMAND",
        title: report.title,
        content: JSON.stringify(report),
        metadata: { generatedBy: report.generatedBy },
      },
    });
  }

  return report;
}

export async function getLatestReport(userId: string) {
  const report = await prisma.report.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!report) return null;
  try {
    return { ...(JSON.parse(report.content) as InsightReport), createdAt: report.createdAt };
  } catch {
    return null;
  }
}
