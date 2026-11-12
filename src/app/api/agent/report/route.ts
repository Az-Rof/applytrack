import { getCurrentUser } from "@/lib/auth";
import {
  generateInsightsReport,
  getLatestReport,
} from "@/lib/agent/insights";
import { handleError, ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const report = await getLatestReport(user.id);
    return ok({ report });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const report = await generateInsightsReport(user.id);
    return ok({ report });
  } catch (err) {
    return handleError(err);
  }
}
