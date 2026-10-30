import { z } from "zod";

import { guideItemSchema, SECTION_KINDS } from "@/lib/guide/types";

/**
 * Shapes shared by the concierge (server) and the chat sheet (client), so no server
 * imports here.
 */

export const CHAT_LIMITS = {
  /** Characters per guest message. */
  maxChars: 500,
  /** Guest messages per guide per hour. */
  perHour: 20,
} as const;

/**
 * One recommendation card in the chat: a Qloo entity returned by a tool in this
 * conversation or already in the guide, after the server validated its ID.
 * `item.why_you` holds the concierge's reason for showing it.
 */
export const chatCardSchema = z.object({
  section: z.enum(SECTION_KINDS),
  item: guideItemSchema,
  /** Position in the Qloo result it came from, for "Why this?". */
  rank: z.number().int().min(1),
  total: z.number().int().min(1),
  radiusM: z.number().nullable(),
});
export type ChatCard = z.infer<typeof chatCardSchema>;

/** What the chat sheet shows for one stored message. */
export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: ChatCard[];
}

/** The tools the concierge can call, for the "working on it" line in the sheet. */
export const CONCIERGE_TOOLS = [
  "recommend_places",
  "recommend_media",
  "search_tags",
  "get_weather",
  "get_guide_items",
  "show_cards",
] as const;
export type ConciergeToolName = (typeof CONCIERGE_TOOLS)[number];

/** Server-sent events from `POST /api/guides/[id]/chat`, one JSON object per `data:` line. */
export type ChatEvent =
  | { type: "status"; tool: ConciergeToolName }
  | { type: "text"; delta: string }
  /** The reply so far is replaced (a refusal, or a model fallback rewrote it). */
  | { type: "replace"; text: string }
  | { type: "cards"; cards: ChatCard[] }
  | { type: "done" }
  | { type: "error"; message: string };
