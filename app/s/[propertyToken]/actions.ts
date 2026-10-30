"use server";

import { redirect } from "next/navigation";

import { copy } from "@/lib/copy";
import { newGuideFieldErrors, newGuideValues, parseNewGuide } from "@/lib/guide/new-guide";
import { createSelfServeGuide } from "@/lib/guide/self-serve";

export type SelfServeActionResult = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

/**
 * `/s/[token]` entry: creates a guide with source `self_serve`, then opens its quiz. Only
 * the per-property limit applies: hotel guests often share one Wi-Fi address.
 */
export async function startSelfServe(
  propertyToken: string,
  _prev: SelfServeActionResult | null,
  formData: FormData,
): Promise<SelfServeActionResult> {
  const t = copy.guest.selfServe;
  const parsed = parseNewGuide(formData);
  const values = newGuideValues(formData);
  if (!parsed.success)
    return { ok: false, error: t.check, fieldErrors: newGuideFieldErrors(parsed.error), values };

  const { firstName, checkIn, checkOut, partyType } = parsed.data;
  const result = await createSelfServeGuide(propertyToken, {
    firstName,
    checkIn,
    checkOut,
    partyType,
  });
  if (!result.ok)
    return {
      ok: false,
      error: result.reason === "rate_limited" ? t.rateLimited : t.error,
      values,
    };
  redirect(`/g/${result.token}/quiz`);
}
