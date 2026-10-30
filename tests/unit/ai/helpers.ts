import OpenAI from "openai";

import type { ConciergeData } from "@/lib/ai/tools";
import type { GuideItem } from "@/lib/guide/types";
import type { GuideViewSection } from "@/lib/guide/view";
import { DEMO_PROPERTY, type DemoGuest } from "@/tests/fixtures/concierge-guests";

export const CHAT_GUIDE_ID = "00000000-0000-4000-8000-0000000000c1";

/** A demo guest's stay as the concierge sees it, without a database. */
export function conciergeData(guest: DemoGuest, sections: GuideViewSection[] = []): ConciergeData {
  const q = guest.quiz;
  return {
    guideId: CHAT_GUIDE_ID,
    context: {
      guide: {
        id: CHAT_GUIDE_ID,
        token: "tok_abcdefghijklmnopq",
        status: "ready",
        partyType: guest.partyType,
        ageBand: guest.ageBand,
        guestFirstName: guest.firstName,
      },
      property: {
        id: "00000000-0000-4000-8000-0000000000aa",
        name: DEMO_PROPERTY.name,
        type: DEMO_PROPERTY.type,
        address: DEMO_PROPERTY.address,
        city: DEMO_PROPERTY.city,
        lat: DEMO_PROPERTY.lat,
        lng: DEMO_PROPERTY.lng,
      },
      quiz: {
        artistIds: q.artist_ids,
        artistNames: q.artist_names,
        mediaIds: q.media_ids,
        mediaNames: q.media_names,
        tagUrns: q.tag_urns,
        tagLabels: q.tag_labels,
        dietary: q.dietary,
        skipped: false,
      },
      hostPicks: [],
    },
    guide: {
      heroLine: null,
      checkIn: "2026-10-24",
      checkOut: "2026-10-28",
      ageBand: guest.ageBand,
      audienceAgeBand: null,
      property: {
        name: DEMO_PROPERTY.name,
        city: DEMO_PROPERTY.city,
        address: DEMO_PROPERTY.address,
        lat: DEMO_PROPERTY.lat,
        lng: DEMO_PROPERTY.lng,
        countryCode: DEMO_PROPERTY.country_code,
        houseNotes: DEMO_PROPERTY.house_notes,
      },
      signals: [...q.artist_names, ...q.media_names],
      sections,
      heatmap: [],
    },
  };
}

export function guideItem(entity_id: string, extra: Partial<GuideItem> = {}): GuideItem {
  return {
    entity_id,
    name: `Place ${entity_id}`,
    category: "Restaurant",
    address: "1 Fixture Lane",
    lat: 38.714,
    lng: -9.139,
    distance_m: 300,
    image_url: null,
    price_level: 2,
    why_you: "Popular with people who love Mara Solé",
    signals_used: ["Mara Solé"],
    affinity: 0.9,
    explain: [{ entity_id: "FIX-A-001", name: "Mara Solé", score: 0.8 }],
    tags: ["Restaurant"],
    ...extra,
  };
}

/** A Responses API response body with the given output items. */
export function responseBody(
  output: unknown[],
  extra: { status?: "completed" | "incomplete"; model?: string; reason?: string } = {},
) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1_793_000_000,
    model: extra.model ?? "gpt-test-2026-10-01",
    status: extra.status ?? "completed",
    incomplete_details: extra.status === "incomplete" ? { reason: extra.reason } : null,
    error: null,
    output,
    usage: {
      input_tokens: 1200,
      input_tokens_details: { cached_tokens: 1024, cache_write_tokens: 0 },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 40 },
      total_tokens: 1500,
    },
  };
}

/** One assistant message holding `text` (structured output is JSON text). */
export const textItem = (text: string) => ({
  type: "message",
  id: "msg_test",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text, annotations: [] }],
});

export const refusalItem = (refusal: string) => ({
  type: "message",
  id: "msg_test",
  role: "assistant",
  status: "completed",
  content: [{ type: "refusal", refusal }],
});

/** The usage `callOf` reports for `responseBody`. */
export const RESPONSE_USAGE = {
  input_tokens: 1200,
  cached_input_tokens: 1024,
  output_tokens: 300,
  reasoning_tokens: 40,
};

/**
 * A real OpenAI client whose `fetch` answers with `reply`, recording every request body,
 * so tests run the SDK's own parsing and see exactly what would be sent.
 */
export function fakeOpenAI(reply: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const requests: Array<Record<string, unknown>> = [];
  const client = new OpenAI({
    apiKey: "test",
    maxRetries: 0,
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
      requests.push(body);
      return reply(body);
    },
  });
  return { client, requests };
}
