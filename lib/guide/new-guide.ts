import { z } from "zod";

import { PARTY_TYPES } from "./types";

/**
 * What a new guide starts with, from the host's "New guest guide" dialog (H4) or a hotel
 * guest's self-serve entry. Form values arrive as strings. Client-safe.
 */

/** Age bands the host can pick, as Qloo buckets (lib/qloo/guard.ts `AGE_BANDS`). */
export const HOST_AGE_BANDS = [
  { value: "24_and_younger", label: "Under 25" },
  { value: "25_to_29", label: "25–29" },
  { value: "30_to_34", label: "30–34" },
  { value: "35_to_44", label: "35–44" },
  { value: "45_to_54", label: "45–54" },
  { value: "55_and_older", label: "55 or older" },
] as const;

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const isoDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-24")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    }, "That date doesn't exist")
    .nullable(),
);

export const newGuideSchema = z
  .object({
    firstName: z.preprocess(
      emptyToNull,
      z.string().trim().max(60, "Keep the name under 60 characters").nullable(),
    ),
    checkIn: isoDate,
    checkOut: isoDate,
    partyType: z.enum(PARTY_TYPES, { error: "Choose who's travelling" }),
    ageBand: z.preprocess(emptyToNull, z.enum(HOST_AGE_BANDS.map((band) => band.value)).nullable()),
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkOut >= v.checkIn, {
    message: "Check-out can't be before check-in",
    path: ["checkOut"],
  });
export type NewGuideInput = z.infer<typeof newGuideSchema>;

export function parseNewGuide(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  };
  return newGuideSchema.safeParse({
    firstName: get("firstName"),
    checkIn: get("checkIn"),
    checkOut: get("checkOut"),
    partyType: get("partyType"),
    ageBand: get("ageBand"),
  });
}

export function newGuideFieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

/** The submitted fields, to refill a form that React reset after a failed action. */
export function newGuideValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["firstName", "checkIn", "checkOut", "partyType", "ageBand"]) {
    const value = formData.get(key);
    if (typeof value === "string") out[key] = value.slice(0, 100);
  }
  return out;
}
