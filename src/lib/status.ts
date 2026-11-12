/**
 * Shared domain constants & helpers.
 * Kept framework-agnostic so the Chrome extension and server share semantics.
 */

export type ApplicationStatus =
  | "APPLIED"
  | "HR_SCREENING"
  | "INTERVIEW"
  | "TECHNICAL_TEST"
  | "USER_INTERVIEW"
  | "OFFER"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN";

/** Linear happy-path progression used for funnels & next-step suggestions. */
export const STATUS_PIPELINE: ApplicationStatus[] = [
  "APPLIED",
  "HR_SCREENING",
  "INTERVIEW",
  "TECHNICAL_TEST",
  "USER_INTERVIEW",
  "OFFER",
  "ACCEPTED",
];

const TERMINAL_STATUSES: ApplicationStatus[] = [
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  HR_SCREENING: "HR Screening",
  INTERVIEW: "Interview",
  TECHNICAL_TEST: "Technical Test",
  USER_INTERVIEW: "User Interview",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

/** Tailwind classes for status badges. */
export const STATUS_STYLE: Record<ApplicationStatus, string> = {
  APPLIED: "bg-slate-100 text-slate-700 ring-slate-200",
  HR_SCREENING: "bg-sky-100 text-sky-700 ring-sky-200",
  INTERVIEW: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  TECHNICAL_TEST: "bg-violet-100 text-violet-700 ring-violet-200",
  USER_INTERVIEW: "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200",
  OFFER: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  ACCEPTED: "bg-green-100 text-green-800 ring-green-200",
  REJECTED: "bg-rose-100 text-rose-700 ring-rose-200",
  WITHDRAWN: "bg-amber-100 text-amber-700 ring-amber-200",
};

/** Chart hex colors mirroring STATUS_STYLE — stable per status, position-independent. */
const STATUS_CHART_COLORS: Record<ApplicationStatus, string> = {
  APPLIED: "#94a3b8", // slate
  HR_SCREENING: "#38bdf8", // sky
  INTERVIEW: "#6366f1", // indigo
  TECHNICAL_TEST: "#8b5cf6", // violet
  USER_INTERVIEW: "#d946ef", // fuchsia
  OFFER: "#10b981", // emerald
  ACCEPTED: "#059669", // green
  REJECTED: "#f43f5e", // rose red — matches the Rejected badge
  WITHDRAWN: "#f59e0b", // amber
};

/** Palette fallback for unknown/unmapped statuses. */
const CHART_PALETTE = [
  "#94a3b8",
  "#38bdf8",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#10b981",
  "#059669",
  "#f43f5e",
  "#f59e0b",
];

/**
 * Hex color for a status, e.g. Rejected is always red regardless of its
 * position in a chart's data array. Unknown statuses cycle the palette.
 */
export function statusChartColor(status: string, index = 0): string {
  const mapped = (STATUS_CHART_COLORS as Record<string, string>)[status.toUpperCase()];
  return mapped ?? CHART_PALETTE[index % CHART_PALETTE.length];
}

export const PLATFORMS = [
  "JobStreet",
  "Glints",
  "LinkedIn",
  "Kalibrr",
  "Indeed",
  "Others",
] as const;

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
  "Freelance",
] as const;

/** Statuses considered "reached interview stage or beyond". */
export const INTERVIEW_STAGE_STATUSES: ApplicationStatus[] = [
  "INTERVIEW",
  "TECHNICAL_TEST",
  "USER_INTERVIEW",
  "OFFER",
  "ACCEPTED",
];

/** Statuses considered an offer. */
export const OFFER_STAGE_STATUSES: ApplicationStatus[] = ["OFFER", "ACCEPTED"];

export function isTerminal(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function progressPercent(status: ApplicationStatus): number {
  if (status === "REJECTED" || status === "WITHDRAWN") return 100;
  const idx = STATUS_PIPELINE.indexOf(status);
  return Math.round(((idx + 1) / STATUS_PIPELINE.length) * 100);
}
