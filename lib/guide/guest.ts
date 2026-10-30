import "server-only";

import { connection } from "next/server";

import { createServiceClient } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";

import { isGuideToken } from "./token";
import type { PartyType } from "./types";

/**
 * Guest pages have no login: the 21-character token in `/g/[token]` is the key. These
 * helpers check its format, then read with the service role, so only the token's own
 * guide is ever returned.
 */

export interface GuestGuide {
  id: string;
  token: string;
  status: Database["public"]["Enums"]["guide_status"];
  guestFirstName: string | null;
  partyType: PartyType;
  hasQuiz: boolean;
  property: { name: string; city: string; address: string; photoUrl: string | null };
  hostName: string | null;
}

/** The guide for a guest token, or null for a malformed or unknown token. Per request. */
export async function getGuideByToken(token: string): Promise<GuestGuide | null> {
  await connection();
  if (!isGuideToken(token)) return null;
  const db = createServiceClient();
  const { data: guide, error } = await db
    .from("guides")
    .select(
      "id, token, status, guest_first_name, party_type, quiz_answers (guide_id), properties (name, city, address, photo_url, hosts (display_name, business_name))",
    )
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`guide lookup failed: ${error.message}`);
  if (!guide?.properties) return null;
  const { properties: property } = guide;
  const host = property.hosts;
  return {
    id: guide.id,
    token: guide.token,
    status: guide.status,
    guestFirstName: guide.guest_first_name,
    partyType: guide.party_type,
    hasQuiz: guide.quiz_answers !== null,
    property: {
      name: property.name,
      city: property.city,
      address: property.address,
      photoUrl: property.photo_url,
    },
    hostName: host?.display_name || host?.business_name || null,
  };
}

/** Where a guest token should land for the guide's current state. */
export function guestStage(guide: Pick<GuestGuide, "status" | "hasQuiz">) {
  if (guide.status === "ready") return "guide" as const;
  if (guide.status === "awaiting_quiz" && !guide.hasQuiz) return "welcome" as const;
  return "building" as const;
}
