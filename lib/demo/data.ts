import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { createServiceClient } from "@/lib/db/server";
import { readServerEnv } from "@/lib/env";
import { selfServeQuota } from "@/lib/guide/self-serve";
import { newGuideToken } from "@/lib/guide/token";
import { loadGuideView, type GuideView } from "@/lib/guide/view";
import { createRateLimiter } from "@/lib/rate-limit";

import {
  DEMO_PAIR,
  DEMO_TRY_PROPERTY,
  demoGuest,
  type DemoGuestKey,
  type DemoGuestSpec,
  type DemoPropertyKey,
} from "./personas";
import { decideTry, demoStayDates } from "./rules";

/**
 * Reads the seeded demo (lib/demo/personas.ts) for /demo, the landing page and the demo login, and
 * creates "Try as a guest" guides. The demo host is found by DEMO_HOST_EMAIL; properties
 * and guides by their `demo_key`. Service role, per request.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function getDemoHostId(db: ServiceClient = createServiceClient()) {
  const { data, error } = await db.rpc("demo_host_id", {
    target_email: readServerEnv().DEMO_HOST_EMAIL,
  });
  if (error) throw new Error(`demo host lookup failed: ${error.message}`);
  return (data as string | null) ?? null;
}

async function demoPropertyId(db: ServiceClient, key: DemoPropertyKey) {
  const hostId = await getDemoHostId(db);
  if (!hostId) return null;
  const { data, error } = await db
    .from("properties")
    .select("id")
    .eq("host_id", hostId)
    .eq("demo_key", key)
    .maybeSingle();
  if (error) throw new Error(`demo property lookup failed: ${error.message}`);
  return data?.id ?? null;
}

export interface DemoGuide {
  key: DemoGuestKey;
  spec: DemoGuestSpec;
  token: string;
  firstName: string | null;
  /** Null until the guide is ready. */
  view: GuideView | null;
}

/**
 * The demo guides for `keys` on `property`, in the order asked; missing ones are left out.
 * Deduplicated per request (the landing page asks twice).
 */
export const loadDemoGuides = cache(async function loadDemoGuides(
  keys: readonly DemoGuestKey[] = DEMO_PAIR,
  property: DemoPropertyKey = "P1",
): Promise<DemoGuide[]> {
  await connection();
  const db = createServiceClient();
  const propertyId = await demoPropertyId(db, property);
  if (!propertyId) return [];
  const { data, error } = await db
    .from("guides")
    .select("id, token, status, demo_key, guest_first_name")
    .eq("property_id", propertyId)
    .in("demo_key", [...keys]);
  if (error) throw new Error(`demo guides lookup failed: ${error.message}`);
  const guides = await Promise.all(
    keys.map(async (key) => {
      const row = data.find((g) => g.demo_key === key);
      if (!row) return null;
      const view = row.status === "ready" ? await loadGuideView(row.id) : null;
      return {
        key,
        spec: demoGuest(key),
        token: row.token,
        firstName: row.guest_first_name,
        view,
      } satisfies DemoGuide;
    }),
  );
  return guides.filter((g) => g !== null);
});

/** A ready demo guide to open when live generation is paused or busy. */
export async function fallbackDemoToken(): Promise<string | null> {
  const guides = await loadDemoGuides(DEMO_PAIR);
  return guides.find((g) => g.view)?.token ?? null;
}

/** Judges share addresses less often than hotel guests, so this one is per IP too. */
const perIp = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });
export const TRY_LIMIT = { limit: 30, windowMs: 60 * 60_000 } as const;

export type TryResult =
  | { ok: true; token: string }
  | { ok: false; reason: "paused" | "busy" | "not_seeded"; fallbackToken: string | null };

/**
 * "Try as a guest": a fresh, nameless guide on the demo flat, ready for the quiz. In replay
 * mode, or past 30 an hour (5 per IP), it hands back a ready demo guide instead.
 */
export async function startDemoGuest(ip: string): Promise<TryResult> {
  await connection();
  const db = createServiceClient();
  const propertyId = await demoPropertyId(db, DEMO_TRY_PROPERTY);
  if (!propertyId) return { ok: false, reason: "not_seeded", fallbackToken: null };

  const now = Date.now();
  const { QLOO_MODE } = readServerEnv();
  let quotaAllowed = true;
  if (QLOO_MODE !== "replay") {
    const { data: recent, error } = await db
      .from("guides")
      .select("created_at")
      .eq("property_id", propertyId)
      .eq("source", "demo")
      .is("demo_key", null)
      .gte("created_at", new Date(now - TRY_LIMIT.windowMs).toISOString())
      .limit(TRY_LIMIT.limit);
    if (error) throw new Error(`demo try count failed: ${error.message}`);
    quotaAllowed = selfServeQuota(
      recent.map((r) => r.created_at),
      now,
      TRY_LIMIT,
    ).allowed;
  }
  // Only count an IP hit when a guide would really be created.
  const ipAllowed = QLOO_MODE === "replay" || !quotaAllowed || perIp.check(ip, now).allowed;
  const decision = decideTry({ qlooMode: QLOO_MODE, quotaAllowed, ipAllowed });
  if (decision.kind === "fallback") {
    return { ok: false, reason: decision.reason, fallbackToken: await fallbackDemoToken() };
  }

  const token = newGuideToken();
  const { checkIn, checkOut } = demoStayDates(new Date(now));
  const { error } = await db.from("guides").insert({
    property_id: propertyId,
    token,
    party_type: "couple",
    check_in: checkIn,
    check_out: checkOut,
    source: "demo",
  });
  if (error) throw new Error(`demo guide insert failed: ${error.message}`);
  return { ok: true, token };
}
