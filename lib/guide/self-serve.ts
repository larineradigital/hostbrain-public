import "server-only";

import { connection } from "next/server";

import { createServiceClient } from "@/lib/db/server";

import type { NewGuideInput } from "./new-guide";
import { isGuideToken, newGuideToken } from "./token";

/**
 * Hotel self-serve: a QR code per property leads to `/s/[token]`, and every
 * scan can create a new guide. The token is checked in code and reads use the service role.
 * The per-property limit is counted in the database, so it holds across server instances.
 */

export const SELF_SERVE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const;

/**
 * Whether one more self-serve guide is allowed, from the creation times of the property's
 * recent self-serve guides. Pure, so it is tested directly.
 */
export function selfServeQuota(
  recent: readonly (string | Date)[],
  now = Date.now(),
  { limit, windowMs } = SELF_SERVE_LIMIT,
) {
  const inWindow = recent
    .map((at) => new Date(at).getTime())
    .filter((t) => Number.isFinite(t) && now - t < windowMs)
    .sort((a, b) => a - b);
  const allowed = inWindow.length < limit;
  // The oldest guide that keeps the count at the limit has to leave the window first.
  const retryAfterS = allowed
    ? 0
    : Math.max(1, Math.ceil((inWindow[inWindow.length - limit] + windowMs - now) / 1000));
  return { allowed, remaining: Math.max(0, limit - inWindow.length), retryAfterS };
}

export interface SelfServeProperty {
  id: string;
  name: string;
  city: string;
  photoUrl: string | null;
}

/** The property behind a self-serve token, if self-serve is on. Per request. */
export async function getSelfServeProperty(token: string): Promise<SelfServeProperty | null> {
  await connection();
  if (!isGuideToken(token)) return null;
  const { data, error } = await createServiceClient()
    .from("properties")
    .select("id, name, city, photo_url")
    .eq("self_serve_token", token)
    .eq("self_serve_enabled", true)
    .maybeSingle();
  if (error) throw new Error(`self-serve lookup failed: ${error.message}`);
  return data && { id: data.id, name: data.name, city: data.city, photoUrl: data.photo_url };
}

export type SelfServeResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "rate_limited"; retryAfterS?: number };

/** Creates a self-serve guide unless the property hit 30 in the last hour. */
export async function createSelfServeGuide(
  propertyToken: string,
  input: Omit<NewGuideInput, "ageBand">,
): Promise<SelfServeResult> {
  const now = Date.now();
  const property = await getSelfServeProperty(propertyToken);
  if (!property) return { ok: false, reason: "not_found" };

  const db = createServiceClient();
  const since = new Date(now - SELF_SERVE_LIMIT.windowMs).toISOString();
  const { data: recent, error } = await db
    .from("guides")
    .select("created_at")
    .eq("property_id", property.id)
    .eq("source", "self_serve")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(SELF_SERVE_LIMIT.limit);
  if (error) throw new Error(`self-serve count failed: ${error.message}`);
  const quota = selfServeQuota(
    recent.map((row) => row.created_at),
    now,
  );
  if (!quota.allowed) return { ok: false, reason: "rate_limited", retryAfterS: quota.retryAfterS };

  const token = newGuideToken();
  const { error: insertError } = await db.from("guides").insert({
    property_id: property.id,
    token,
    guest_first_name: input.firstName,
    party_type: input.partyType,
    check_in: input.checkIn,
    check_out: input.checkOut,
    source: "self_serve",
  });
  if (insertError) throw new Error(`self-serve guide insert failed: ${insertError.message}`);
  return { ok: true, token };
}
