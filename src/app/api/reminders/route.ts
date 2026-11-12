import { getCurrentUser } from "@/lib/auth";
import {
  generateFollowUpReminders,
  listReminders,
  resolveReminder,
} from "@/lib/services/reminders";
import { fail, handleError, ok } from "@/lib/api";
import { applyAutoReject } from "@/lib/services/auto-reject";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    // Opportunistic scan: create reminders for stale applications on page
    // load, and let the user's auto-reject rule flip long-silenced rows.
    await generateFollowUpReminders(user.id);
    await applyAutoReject(user.id);
    const reminders = await listReminders(user.id);
    return ok({ reminders });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const body = (await request.json()) as {
      action: "scan" | "resolve";
      id?: string;
      status?: "DONE" | "DISMISSED";
    };

    if (body.action === "scan") {
      const created = await generateFollowUpReminders(user.id);
      return ok({ created: created.length });
    }

    if (body.action === "resolve" && body.id) {
      const updated = await resolveReminder(user.id, body.id, body.status ?? "DONE");
      if (!updated) return fail("Not found", 404);
      return ok(updated);
    }

    return fail("Invalid action", 400);
  } catch (err) {
    return handleError(err);
  }
}
