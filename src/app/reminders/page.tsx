import { requireUser } from "@/lib/auth";
import { generateFollowUpReminders, listReminders } from "@/lib/services/reminders";
import { PageHeader } from "@/components/ui/primitives";
import { ReminderList } from "@/components/reminders/reminder-list";
import { AutoRejectCard } from "@/components/reminders/auto-reject-card";
import { applyAutoReject } from "@/lib/services/auto-reject";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const user = await requireUser();
  await generateFollowUpReminders(user.id);
  // Automate the user's auto-reject rule on every visit to this page.
  await applyAutoReject(user.id);
  const reminders = await listReminders(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Reminders"
        description="Follow-up prompts for applications that have gone quiet."
      />
      <ReminderList reminders={JSON.parse(JSON.stringify(reminders))} />

      <div className="mt-6">
        <AutoRejectCard />
      </div>
    </div>
  );
}
