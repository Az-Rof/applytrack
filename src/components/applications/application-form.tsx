"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Application } from "@prisma/client";
import { EMPLOYMENT_TYPES, PLATFORMS, STATUS_LABEL } from "@/lib/status";
import { useToast } from "@/components/ui/toaster";

type Props =
  | { mode: "create"; application?: undefined }
  | { mode: "edit"; application: Application };

function toDateInput(d: Date | string | null | undefined) {
  const date = d ? (typeof d === "string" ? new Date(d) : d) : new Date();
  // Local date (avoids UTC shifting the day backwards in UTC+ timezones)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function ApplicationForm({ mode, application }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors({});

    const fd = new FormData(e.currentTarget);
    const payload = {
      jobTitle: fd.get("jobTitle"),
      companyName: fd.get("companyName"),
      platform: fd.get("platform"),
      location: fd.get("location"),
      jobUrl: fd.get("jobUrl"),
      employmentType: fd.get("employmentType"),
      salary: fd.get("salary"),
      appliedAt: fd.get("appliedAt") || undefined,
      status: fd.get("status") || undefined,
      notes: fd.get("notes"),
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/applications" : `/api/applications/${application!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();

      if (res.status === 409) {
        toast(
          `Duplicate: you already applied to this job (${data.application.companyName}).`,
          "error",
        );
        return;
      }

      if (!res.ok) {
        if (data.details && Array.isArray(data.details)) {
          const map: Record<string, string> = {};
          for (const issue of data.details) {
            const key = issue.path?.[0];
            if (key && !map[key]) map[key] = issue.message;
          }
          setErrors(map);
        }
        toast(data.error ?? "Failed to save application", "error");
        return;
      }

      toast(mode === "create" ? "Application added" : "Application updated");
      router.push(`/applications/${data.application?.id ?? application!.id}`);
      router.refresh();
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title *" error={errors.jobTitle}>
          <input
            name="jobTitle"
            className="input"
            defaultValue={application?.jobTitle ?? ""}
            placeholder="Data Analyst"
            required
          />
        </Field>
        <Field label="Company *" error={errors.companyName}>
          <input
            name="companyName"
            className="input"
            defaultValue={application?.companyName ?? ""}
            placeholder="PT ABC Corp"
            required
          />
        </Field>
        <Field label="Platform *" error={errors.platform}>
          <select
            name="platform"
            className="input"
            defaultValue={application?.platform ?? "JobStreet"}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location" error={errors.location}>
          <input
            name="location"
            className="input"
            defaultValue={application?.location ?? ""}
            placeholder="Jakarta"
          />
        </Field>
        <Field label="Employment type">
          <select
            name="employmentType"
            className="input"
            defaultValue={application?.employmentType ?? ""}
          >
            <option value="">—</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Salary (optional)" error={errors.salary}>
          <input
            name="salary"
            className="input"
            defaultValue={application?.salary ?? ""}
            placeholder="IDR 10-15M / month"
          />
        </Field>
        <Field label="Applied date">
          <input
            type="date"
            name="appliedAt"
            className="input"
            defaultValue={toDateInput(application?.appliedAt)}
          />
        </Field>
        <Field label="Status">
          <select
            name="status"
            className="input"
            defaultValue={application?.status ?? "APPLIED"}
            disabled={mode === "edit"}
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {mode === "edit" && (
            <p className="mt-1 text-xs text-slate-400">
              Change status from the application detail page to keep history.
            </p>
          )}
        </Field>
      </div>

      <Field label="Job URL" error={errors.jobUrl}>
        <input
          name="jobUrl"
          className="input"
          defaultValue={application?.jobUrl ?? ""}
          placeholder="https://www.jobstreet.co.id/job/..."
        />
      </Field>

      <Field label="Notes" error={errors.notes}>
        <textarea
          name="notes"
          className="input min-h-[96px] resize-y"
          defaultValue={application?.notes ?? ""}
          placeholder="Recruiter contact, referral, next steps…"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : mode === "create" ? "Add Application" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
