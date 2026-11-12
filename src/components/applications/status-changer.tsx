"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABEL, type ApplicationStatus } from "@/lib/status";
import { useToast } from "@/components/ui/toaster";

export function StatusChanger({
  applicationId,
  current,
}: {
  applicationId: string;
  current: ApplicationStatus;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function change(status: string) {
    if (!status || status === current) return;
    setPending(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast(`Status updated to ${STATUS_LABEL[status as ApplicationStatus]}`);
      router.refresh();
    } catch {
      toast("Failed to update status", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input w-auto min-w-[160px]"
        value={current}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
      >
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-slate-400">Updating…</span>}
    </div>
  );
}

export function DeleteButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!confirm("Delete this application and its history?")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast("Application deleted");
      router.push("/applications");
      router.refresh();
    } catch {
      toast("Failed to delete", "error");
      setPending(false);
    }
  }

  return (
    <button className="btn-danger" onClick={onDelete} disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
