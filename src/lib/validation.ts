import { z } from "zod";
import { EMPLOYMENT_TYPES, STATUS_LABEL } from "@/lib/status";

const statusEnum = z.enum(
  Object.keys(STATUS_LABEL) as [keyof typeof STATUS_LABEL, ...(keyof typeof STATUS_LABEL)[]],
);

export const createApplicationSchema = z.object({
  jobTitle: z.string().trim().min(1, "Job title is required").max(200),
  companyName: z.string().trim().min(1, "Company is required").max(200),
  platform: z.string().trim().min(1, "Platform is required").max(100),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  jobUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  employmentType: z
    .enum(EMPLOYMENT_TYPES)
    .optional()
    .or(z.literal("")),
  salary: z.string().trim().max(100).optional().or(z.literal("")),
  appliedAt: z.coerce.date().optional(),
  status: statusEnum.optional(),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const updateApplicationSchema = createApplicationSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const changeStatusSchema = z.object({
  status: statusEnum,
  note: z.string().trim().max(500).optional(),
});

/**
 * Payload sent by the Chrome extension when an "Apply" event is detected.
 * The extension does its best-effort extraction in the DOM; the server
 * optionally enriches / repairs it with an LLM.
 */
export const captureSchema = z.object({
  jobTitle: z.string().trim().max(200).optional(),
  companyName: z.string().trim().max(200).optional(),
  platform: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  employmentType: z.string().trim().max(100).optional(),
  salary: z.string().trim().max(100).optional(),
  jobUrl: z.string().trim().max(2000).optional(),
  pageText: z.string().max(8000).optional(),
  appliedAt: z.coerce.date().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
