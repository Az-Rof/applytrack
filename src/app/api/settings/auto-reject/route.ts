import { NextResponse } from "next/server";
import { getUserForRequest } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import { applyAutoReject, getAutoRejectDays, setAutoRejectDays } from "@/lib/services/auto-reject";

/**
 * Per-user auto-reject setting.
 *   GET  → { autoRejectDays } (null = off)
 *   PUT  → { days: number | null }       save (null disables)
 *   POST → apply the rule immediately → { days, rejected }
 */
export async function GET(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Not logged in", 401);
    return NextResponse.json({ autoRejectDays: await getAutoRejectDays(user.id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Not logged in", 401);

    let body: { days?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return fail("Send JSON: { days: number | null }.", 400);
    }

    const raw = body.days;
    if (!(raw === null || raw === undefined || typeof raw === "number")) {
      return fail(
        "Invalid value",
        422,
        "`days` must be a number of days (1–365) or null to turn the rule off.",
      );
    }
    if (raw !== null && raw !== undefined && (!Number.isFinite(raw) || raw < 1 || raw > 365)) {
      return fail("Out of range", 422, "`days` must be between 1 and 365 (or null to disable).");
    }

    const days = await setAutoRejectDays(user.id, raw ?? null);
    return NextResponse.json({ autoRejectDays: days });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserForRequest(request);
    if (!user) return fail("Not logged in", 401);
    const result = await applyAutoReject(user.id);
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
