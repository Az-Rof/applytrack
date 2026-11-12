import { prisma } from "@/lib/prisma";
import { generateFollowUpReminders } from "@/lib/services/reminders";
import { fail, handleError, ok } from "@/lib/api";

/**
 * POST /api/cron/reminders
 * Generates follow-up reminders for every user with stale applications.
 * Protect with `Authorization: Bearer <CRON_SECRET>` and call from a scheduler
 * (Vercel Cron, GitHub Actions, Windows Task Scheduler, etc.).
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (provided !== secret) return fail("Unauthorized", 401);
    }

    const users = await prisma.user.findMany({ select: { id: true } });
    let total = 0;
    for (const user of users) {
      const created = await generateFollowUpReminders(user.id);
      total += created.length;
    }

    return ok({ users: users.length, remindersCreated: total });
  } catch (err) {
    return handleError(err);
  }
}
