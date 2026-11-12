import { NextResponse } from "next/server";
import { getUserForRequest, extensionApiKeyError } from "@/lib/auth";
import { createApplication } from "@/lib/services/applications";
import { captureSchema, type CreateApplicationInput } from "@/lib/validation";
import { extractJobWithAgent } from "@/lib/agent/extract";
import { handleError } from "@/lib/api";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-ApplyTrack-Session",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/capture
 * Called by the Chrome extension when an "Apply" action is detected.
 *
 * Auth:
 *  - `Authorization: Bearer <EXTENSION_API_KEY>` — required in production,
 *    in development a mismatch is only logged (the most common cause of
 *    confusing 401s while setting the extension up).
 *  - `X-ApplyTrack-Session: <token>` — identifies the user (by `id`).
 *    The extension gets the token by logging in with email + password
 *    (popup form → POST /api/auth/login) and stores it in extension
 *    storage.
 */
/** Map schema.org / raw DOM values onto the canonical EMPLOYMENT_TYPES. */
function normalizeEmploymentType(raw?: string | null): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  const canonical = value.toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    FULL_TIME: "Full-time",
    PART_TIME: "Part-time",
    CONTRACT: "Contract",
    TEMPORARY: "Contract",
    INTERNSHIP: "Internship",
    INTERN: "Internship",
    FREELANCE: "Freelance",
  };
  return map[canonical] ?? value;
}

export async function POST(request: Request) {
  try {
    const apiKeyError = extensionApiKeyError(request, CORS_HEADERS);
    if (apiKeyError) return apiKeyError;

    const user = await getUserForRequest(request);
    if (!user) {
      return NextResponse.json(
        {
          error: "Not logged in",
          hint: "Log in to the extension popup with your email and password first.",
        },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const payload = captureSchema.parse(await request.json());

    // Agent step 1: extract / enrich job data
    const { result, usedLLM } = await extractJobWithAgent(payload);

    const missing = (["jobTitle", "companyName"] as const).filter((k) => !result[k]);
    if (missing.length) {
      return NextResponse.json(
        {
          error: `Could not extract required fields: ${missing.join(", ")}`,
          details: { extracted: result },
        },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    // Agent step 2: persist with duplicate detection
    const { application, duplicate } = await createApplication(user.id, {
      jobTitle: result.jobTitle.slice(0, 200),
      companyName: result.companyName.slice(0, 200),
      platform: result.platform || "Others",
      location: result.location,
      employmentType: normalizeEmploymentType(result.employmentType) as CreateApplicationInput["employmentType"],
      salary: result.salary,
      jobUrl: payload.jobUrl,
      appliedAt: payload.appliedAt,
      status: "APPLIED",
      source: "EXTENSION",
    });

    return NextResponse.json(
      {
        application,
        duplicate,
        agent: { usedLLM, extracted: result },
      },
      { status: duplicate ? 200 : 201, headers: CORS_HEADERS },
    );
  } catch (err) {
    return handleError(err);
  }
}
