import { PageHeader } from "@/components/ui/primitives";
import { SyncWorkspace } from "@/components/sync/sync-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Sync Applications"
        description="Keep every submitted application and its current status in sync with glints.com — no manual import needed."
      />
      <SyncWorkspace />

      <div className="card mt-6 p-5 text-sm leading-relaxed text-slate-600">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          How does sync work — without any Glints cookie on this server?
        </h2>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <span className="font-semibold text-slate-800">Extension (the only way):</span>{" "}
            open the ApplyTrack extension popup while logged in to glints.com
            and press <em>Sync Glints applications</em> — it pulls your
            applications inside your own browser (your Glints session stays
            in your browser, never sent to ApplyTrack) and posts only the raw
            payloads here.
          </li>
          <li>
            <span className="font-semibold text-slate-800">Offline fallback:</span>{" "}
            export a .har file from DevTools on glints.com and import it below
            — only the API response bodies inside the file are read.
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Sync is idempotent — rows are matched by their platform application/job
          ID, so re-running never duplicates. Statuses of extension/imported
          rows are refreshed with history dated to the real platform events;
          manual rows keep their local status (differences are reported as
          conflicts). The auto-reject rule runs after every sync.
        </p>
      </div>
    </div>
  );
}
