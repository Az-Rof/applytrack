import { cn } from "@/lib/utils";

/** Human labels for known platform moderation flags. */
const FLAG_LABELS: Record<string, string> = {
  VERIFIED_SCAM_FRAUD: "Verified scam",
};

/** Glints moderation values always mention fraud/scam/violation. */
function isModerationFlag(jobFlag?: string | null): boolean {
  if (!jobFlag) return false;
  return /FRAUD|SCAM|VIOLATION|MODERAT/i.test(jobFlag);
}

function flagLabel(raw: string): string {
  return (
    FLAG_LABELS[raw.toUpperCase()] ??
    raw
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Chips mirroring the *job-posting* state the platform reports — independent
 * of the application status. Two closed flavors exist:
 *
 *  - **Job Removed** — closed *and* carrying a moderation flag (Glints takes
 *    the posting down, e.g. because it was verified as a scam).
 *  - **Closed** — closed without moderation: the employer closed the vacancy
 *    and no longer accepts applications.
 *
 * A moderation flag on an *open* posting is shown on its own.
 */
export function JobFlagBadges({
  jobClosed,
  jobFlag,
  className,
}: {
  jobClosed?: boolean;
  jobFlag?: string | null;
  className?: string;
}) {
  const moderation = isModerationFlag(jobFlag);
  const closedLabel = jobClosed ? (moderation ? "Job Removed" : "Closed") : null;
  const closedTitle = moderation
    ? "This posting was taken down — verified scam or rule violation on the platform."
    : "The employer closed this vacancy — no longer accepting applications.";

  if (!closedLabel && !jobFlag) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {closedLabel && (
        <span title={closedTitle} className="badge bg-rose-100 text-rose-700 ring-rose-200">
          {closedLabel}
        </span>
      )}
      {jobFlag && (
        <span
          title={`Platform moderation flag: ${jobFlag}`}
          className="badge bg-amber-100 text-amber-800 ring-amber-200"
        >
          {flagLabel(jobFlag)}
        </span>
      )}
    </span>
  );
}
