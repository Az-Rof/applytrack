import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { EMPLOYMENT_TYPES, PLATFORMS } from "@/lib/status";

let client: OpenAI | null = null;

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const hasLLM = () => Boolean(process.env.OPENAI_API_KEY);

const extractedJobSchema = z.object({
  jobTitle: z.string().describe("Job position title"),
  companyName: z.string().describe("Hiring company name"),
  platform: z.string().describe("Job board platform name"),
  location: z.string().describe("Location or 'Remote' if unknown"),
  employmentType: z.string().describe("Full-time, Contract, Internship, etc., or empty"),
  salary: z.string().describe("Salary info if present, otherwise empty"),
});

type ExtractedJob = z.infer<typeof extractedJobSchema>;

const SYSTEM_PROMPT = `You are ApplyTrack Agent, an extraction and analysis agent for a job application tracker.
You receive raw content from a job posting page after the user clicked "Apply".
Extract structured data. Never invent values: if a field is not present, return an empty string.
Platform must be one of: ${PLATFORMS.join(", ")}. Use "Others" if the platform is unknown.
Employment type should be one of: ${EMPLOYMENT_TYPES.join(", ")} when it can be inferred.`;

/** Detect the platform from a URL hostname (works without an LLM). */
function detectPlatform(url?: string | null, hint?: string | null) {
  if (hint) {
    const h = hint.toLowerCase();
    if (h.includes("jobstreet")) return "JobStreet";
    if (h.includes("glints")) return "Glints";
    if (h.includes("linkedin")) return "LinkedIn";
    if (h.includes("kalibrr")) return "Kalibrr";
    if (h.includes("indeed")) return "Indeed";
  }
  if (url) {
    const h = url.toLowerCase();
    if (h.includes("jobstreet")) return "JobStreet";
    if (h.includes("glints")) return "Glints";
    if (h.includes("linkedin")) return "LinkedIn";
    if (h.includes("kalibrr")) return "Kalibrr";
    if (h.includes("indeed")) return "Indeed";
  }
  return "Others";
}

/**
 * Use the LLM to repair/enrich the extension's best-effort DOM extraction.
 * Falls back to the raw payload when OpenAI is not configured or errors.
 */
export async function extractJobWithAgent(payload: {
  jobTitle?: string;
  companyName?: string;
  platform?: string;
  location?: string;
  employmentType?: string;
  salary?: string;
  jobUrl?: string;
  pageText?: string;
}): Promise<{ result: ExtractedJob; usedLLM: boolean }> {
  const fallback: ExtractedJob = {
    jobTitle: payload.jobTitle ?? "",
    companyName: payload.companyName ?? "",
    platform: detectPlatform(payload.jobUrl, payload.platform),
    location: payload.location ?? "",
    employmentType: payload.employmentType ?? "",
    salary: payload.salary ?? "",
  };

  const openai = getOpenAI();
  if (!openai || !payload.pageText) return { result: fallback, usedLLM: false };

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `URL: ${payload.jobUrl ?? "unknown"}
Extension guesses (may be wrong/empty): ${JSON.stringify(
            {
              jobTitle: payload.jobTitle,
              companyName: payload.companyName,
              location: payload.location,
              employmentType: payload.employmentType,
              salary: payload.salary,
            },
            null,
            0,
          )}

Page content (truncated):
"""
${payload.pageText.slice(0, 6000)}
"""`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { result: fallback, usedLLM: false };
    const parsed = extractedJobSchema.partial().parse(JSON.parse(raw));
    return {
      result: {
        jobTitle: parsed.jobTitle || fallback.jobTitle,
        companyName: parsed.companyName || fallback.companyName,
        platform: parsed.platform || fallback.platform,
        location: parsed.location || fallback.location,
        employmentType: parsed.employmentType || fallback.employmentType,
        salary: parsed.salary || fallback.salary,
      },
      usedLLM: true,
    };
  } catch (err) {
    console.error("[agent] extraction failed", err);
    return { result: fallback, usedLLM: false };
  }
}
