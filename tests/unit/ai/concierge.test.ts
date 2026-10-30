import { beforeAll, describe, expect, it, vi } from "vitest";

import { CHAT_LIMITS, type ChatCard, type ChatEvent } from "@/lib/ai/chat";
import {
  chatRequestSchema,
  CONCIERGE_SYSTEM_PROMPT,
  createChatRateLimiter,
  guestContextBlock,
  historyMessages,
  MAX_ITERATIONS,
  SHOW_CARDS_NUDGE,
  runConciergeTurn,
  type StoredChatMessage,
} from "@/lib/ai/concierge";
import { createOpenAIProvider } from "@/lib/ai/openai";
import { createReplayClient, pickTurn, streamTurn, type FixtureTurn } from "@/lib/ai/replay";
import {
  cleanReason,
  conciergeTools,
  createToolSession,
  recommendMediaInput,
  recommendPlaces,
  recommendPlacesInput,
  REASON_MAX,
  searchTagsInput,
  showCardsInput,
  showCardsTool,
  validateCards,
} from "@/lib/ai/tools";
import { isAlcoholThemed } from "@/lib/guide/family-filter";
import type { LlmLogEntry } from "@/lib/guide/store";
import type { QlooClient } from "@/lib/qloo/client";
import { mockQloo } from "@/tests/unit/guide/helpers";
import { COUPLE_GUEST, DEMO_QUESTIONS, FAMILY_GUEST } from "@/tests/fixtures/concierge-guests";

import { conciergeData, fakeOpenAI, guideItem } from "./helpers";

const MODEL = "gpt-6.1-sol";
const replayLlm = () => createOpenAIProvider(createReplayClient({ delayMs: 0 }), MODEL);
/** A fake OpenAI whose every call streams `turn`. */
const llmFor = (turn: FixtureTurn) => {
  const fake = fakeOpenAI(
    () =>
      new Response(streamTurn(turn, MODEL, "test", 0), {
        headers: { "content-type": "text/event-stream" },
      }),
  );
  return { llm: createOpenAIProvider(fake.client, MODEL), requests: fake.requests };
};

// The turn reads today's weather for the context block; never call Open-Meteo from tests.
beforeAll(() => {
  vi.stubEnv("WEATHER_MODE", "mock");
  vi.stubEnv("QLOO_MODE", "mock");
});

const card = (id: string, extra: Partial<ChatCard> = {}): ChatCard => ({
  section: "eat",
  item: guideItem(id),
  rank: 1,
  total: 3,
  radiusM: 2000,
  ...extra,
});

/** Mock Qloo that also records every request's params, to check what left the server. */
function recordingQloo() {
  const { client: inner } = mockQloo();
  const requests: Array<Record<string, unknown>> = [];
  const client: QlooClient = {
    mode: inner.mode,
    get(path, params, context) {
      requests.push({ path, ...params });
      return inner.get(path, params, context);
    },
  };
  return { client, requests };
}

describe("show_cards ID validation", () => {
  const known = new Map([
    ["FIX-P-001", card("FIX-P-001")],
    ["FIX-P-002", card("FIX-P-002")],
  ]);

  it("keeps known IDs with the concierge's reason and drops everything else", () => {
    const { cards, dropped } = validateCards(
      [
        { entity_id: "FIX-P-001", reason: "Popular with people who love Mara Solé" },
        { entity_id: "FIX-P-999", reason: "Made up" },
        { entity_id: "Casa Inventada", reason: "A name, not an ID" },
      ],
      known,
    );
    expect(cards.map((c) => c.item.entity_id)).toEqual(["FIX-P-001"]);
    expect(cards[0].item.why_you).toBe("Popular with people who love Mara Solé");
    expect(dropped).toEqual(["FIX-P-999", "Casa Inventada"]);
  });

  it("shows each place once, also across calls in one turn", () => {
    const first = validateCards(
      [
        { entity_id: "FIX-P-001", reason: "One" },
        { entity_id: "FIX-P-001", reason: "Again" },
      ],
      known,
    );
    expect(first.cards).toHaveLength(1);
    const second = validateCards(
      [{ entity_id: "FIX-P-001", reason: "Third time" }],
      known,
      new Set(["FIX-P-001"]),
    );
    expect(second.cards).toHaveLength(0);
    expect(second.dropped).toEqual([]);
  });

  it("cleans reasons and falls back to the guide line when a reason is empty", () => {
    const long = `${"Popular with people who love natural wine and small plates ".repeat(3)}🍷`;
    const { cards } = validateCards(
      [
        { entity_id: "FIX-P-001", reason: long },
        { entity_id: "FIX-P-002", reason: " 🍷 " },
      ],
      known,
    );
    expect(cards[0].item.why_you.length).toBeLessThanOrEqual(REASON_MAX);
    expect(cards[0].item.why_you).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(cards[1].item.why_you).toBe(known.get("FIX-P-002")!.item.why_you);
    expect(cleanReason("  short   line ")).toBe("short line");
  });

  it("allows guide items and earlier tool results, nothing else", () => {
    const data = conciergeData(COUPLE_GUEST, [
      { section: "eat", intro: "", items: [guideItem("FIX-P-008")], radiusM: 2000 },
    ]);
    const events: ChatEvent[] = [];
    const session = createToolSession(data, {
      previous: [card("FIX-P-025", { section: "drink" })],
      emit: (event) => events.push(event),
    });
    const result = JSON.parse(
      showCardsTool(session, {
        items: [
          { entity_id: "FIX-P-008", reason: "From the guide" },
          { entity_id: "FIX-P-025", reason: "From an earlier answer" },
          { entity_id: "FIX-P-404", reason: "Invented" },
        ],
      }),
    );
    expect(result.shown).toEqual(["FIX-P-008", "FIX-P-025"]);
    expect(result.not_shown).toEqual(["FIX-P-404"]);
    expect(session.dropped).toEqual(["FIX-P-404"]);
    expect(events).toEqual([
      { type: "cards", cards: expect.arrayContaining([expect.objectContaining({ rank: 1 })]) },
    ]);
    expect(session.shown.map((c) => c.item.entity_id)).toEqual(["FIX-P-008", "FIX-P-025"]);
  });
});

describe("chat limits", () => {
  it("allows 20 messages per guide per hour", () => {
    const limiter = createChatRateLimiter();
    const t0 = Date.UTC(2026, 9, 24, 18);
    for (let i = 0; i < CHAT_LIMITS.perHour; i++) {
      expect(limiter.check("guide-a", t0 + i * 1000).allowed).toBe(true);
    }
    const blocked = limiter.check("guide-a", t0 + 30_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBeGreaterThan(0);
    expect(blocked.retryAfterS).toBeLessThanOrEqual(3600);
    // Another guide has its own budget, and the first frees up an hour later.
    expect(limiter.check("guide-b", t0 + 30_000).allowed).toBe(true);
    expect(limiter.check("guide-a", t0 + 60 * 60_000 + 1).allowed).toBe(true);
  });

  it("takes messages of 1 to 500 characters", () => {
    const token = "a".repeat(21);
    expect(chatRequestSchema.safeParse({ token, message: "x".repeat(500) }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ token, message: "x".repeat(501) }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ token, message: "   " }).success).toBe(false);
    expect(chatRequestSchema.parse({ token, message: "  hi  " }).message).toBe("hi");
  });
});

describe("tool schemas", () => {
  const tools = conciergeTools(createToolSession(conciergeData(COUPLE_GUEST)));

  it("are the six tools from the plan, with strict schemas, in a fixed order", () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      "recommend_places",
      "recommend_media",
      "search_tags",
      "get_weather",
      "get_guide_items",
      "show_cards",
    ]);
    for (const tool of tools) {
      const schema = tool.parameters as {
        type: string;
        additionalProperties: boolean;
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      // Strict mode: every field is required (optional ones are nullable).
      expect(schema.required).toEqual(Object.keys(schema.properties));
      // String length bounds strict mode can't take are moved into descriptions.
      expect(JSON.stringify(schema)).not.toMatch(/"(minLength|maxLength|\$schema)"/);
    }
    // Numeric and array bounds stay in the schema.
    expect(JSON.stringify(tools[0].parameters)).toMatch(/"maximum":5000/);
    expect(JSON.stringify(tools[5].parameters)).toMatch(/"maxItems":6/);
    expect(JSON.stringify(tools[2].parameters)).toMatch(/minLength: 2, maxLength: 40/);
  });

  it("are byte-stable across sessions, so the prompt cache holds", () => {
    const other = conciergeTools(createToolSession(conciergeData(FAMILY_GUEST)));
    const defs = (list: typeof tools) =>
      JSON.stringify(
        list.map(({ name, description, parameters }) => [name, description, parameters]),
      );
    expect(defs(other)).toBe(defs(tools));
  });

  it("recommend_places drops alcohol places for families, also for late-night asks", async () => {
    const run = async (guest: typeof FAMILY_GUEST, category: "indoor" | "late_night") => {
      const qloo = mockQloo();
      const session = createToolSession(conciergeData(guest), { qloo: qloo.client });
      const input = { category, extra_tags: null, radius_m: 3000, price: null, count: 6 };
      const output = JSON.parse(await recommendPlaces(session, input)) as {
        places: { entity_id: string; qloo_tags: string[]; name: string }[];
      };
      const returned = JSON.stringify(qloo.responses);
      return { ids: output.places.map((p) => p.entity_id), output, returned };
    };
    const couple = await run(COUPLE_GUEST, "indoor");
    expect(couple.ids).toContain("FIX-P-033");

    const family = await run(FAMILY_GUEST, "indoor");
    // Qloo ranked the beer museum for the family too; the tool dropped it.
    expect(family.returned).toContain("FIX-P-033");
    expect(family.ids).not.toContain("FIX-P-033");
    expect(family.ids.length).toBeGreaterThan(0);

    const lateNight = await run(FAMILY_GUEST, "late_night");
    for (const p of lateNight.output.places) {
      expect(isAlcoholThemed({ name: p.name, tags: p.qloo_tags.map((id) => ({ id })) })).toBe(
        false,
      );
    }
  });

  it("still enforce the bounds when the loop parses an input", () => {
    const places = { category: "eat", extra_tags: null, radius_m: null, price: null, count: 3 };
    expect(recommendPlacesInput.safeParse(places).success).toBe(true);
    expect(recommendPlacesInput.safeParse({ ...places, count: 7 }).success).toBe(false);
    expect(recommendPlacesInput.safeParse({ ...places, radius_m: 100 }).success).toBe(false);
    expect(recommendPlacesInput.safeParse({ ...places, category: "bars" }).success).toBe(false);
    expect(recommendPlacesInput.safeParse({ ...places, x: 1 }).success).toBe(true);
    expect(
      recommendMediaInput.safeParse({ type: "podcast", count: 3, mood_tags: null }).success,
    ).toBe(false);
    expect(searchTagsInput.safeParse({ query: "x".repeat(41) }).success).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => ({ entity_id: `FIX-P-00${i}`, reason: "r" }));
    expect(showCardsInput.safeParse({ items: seven }).success).toBe(false);
    expect(showCardsInput.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("prompt and context", () => {
  it("keeps the system prompt free of guest data and dates", () => {
    expect(CONCIERGE_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}|Zelda|Lisbon/);
  });

  it("gives the guest context without the guest's name", () => {
    const block = guestContextBlock(
      conciergeData(COUPLE_GUEST, [
        { section: "eat", intro: "", items: [guideItem("FIX-P-008")], radiusM: 2000 },
      ]),
      { now: new Date("2026-10-24T18:30:00Z"), weather: null },
    );
    expect(block).not.toContain("Zelda");
    expect(block).toContain('artist "Mara Solé" (FIX-A-001)');
    expect(block).toContain("Local time now: Saturday, 24 October 2026, 19:30 (Europe/Lisbon)");
    expect(block).toContain("Party: couple");
    expect(block).toContain("Dietary needs: vegetarian");
    expect(block).toContain("FIX-P-008: Place FIX-P-008");
  });

  it("sends earlier turns as text, with the cards by name and ID", () => {
    const history: StoredChatMessage[] = [
      { id: "1", role: "user", content: { text: "Coffee?" } },
      {
        id: "2",
        role: "assistant",
        content: { text: "Try these.", cards: [card("FIX-P-015")], seen: [] },
      },
    ];
    expect(historyMessages(history)).toEqual([
      { role: "user", text: "Coffee?" },
      { role: "assistant", text: "Try these.\n\n[Cards shown: Place FIX-P-015 (FIX-P-015)]" },
    ]);
  });
});

describe("concierge turn (replay fixture, mock Qloo)", () => {
  async function ask(guest: typeof COUPLE_GUEST, message: string) {
    const qloo = recordingQloo();
    const events: ChatEvent[] = [];
    const logs: LlmLogEntry[] = [];
    const result = await runConciergeTurn({
      llm: replayLlm(),
      data: conciergeData(guest),
      history: [],
      message,
      emit: (event) => events.push(event),
      log: async (entry) => void logs.push(entry),
      qloo: qloo.client,
      now: () => Date.UTC(2026, 9, 24, 18),
    });
    return { result, events, logs, requests: qloo.requests };
  }

  const ids = (cards: ChatCard[]) => cards.map((c) => c.item.entity_id);

  it("rainy day with kids: weather, indoor family places, 3 cards", async () => {
    const { result, events, requests } = await ask(FAMILY_GUEST, DEMO_QUESTIONS.rainyKids);
    expect(result.source).toBe("llm");
    expect(ids(result.cards)).toEqual(["FIX-P-018", "FIX-P-031", "FIX-P-017"]);
    expect(result.cards.every((c) => c.section === "rainy")).toBe(true);
    expect(events).toContainEqual({ type: "status", tool: "get_weather" });
    expect(result.text).toMatch(/^Indoor it is\./);
    // Family rules: family-friendly signal on, and no bars among the results.
    const call = requests.find((r) => r.path === "/v2/insights")!;
    expect(String(call["signal.interests.tags"])).toContain("family_friendly");
  });

  it("romantic dinner: eat, mid price, 3 cards, and an invented ID is dropped and logged", async () => {
    const { result, logs, requests } = await ask(COUPLE_GUEST, DEMO_QUESTIONS.romanticDinner);
    expect(ids(result.cards)).toEqual(["FIX-P-001", "FIX-P-006", "FIX-P-004"]);
    expect(result.cards.every((c) => c.item.price_level !== null && c.item.price_level <= 2)).toBe(
      true,
    );
    expect(result.cards[0].item.why_you).toContain("Mara Solé");
    expect(ids(result.cards)).not.toContain("FIX-P-404");
    expect(logs.some((l) => l.error?.includes("dropped 1 unknown ID"))).toBe(true);
    const call = requests.find((r) => r.path === "/v2/insights")!;
    expect(call["filter.price_level.max"]).toBe(2);
    expect(String(call["signal.interests.tags"])).toContain("urn:tag:ambience:qloo:romantic");
  });

  it("music like Peggy Gou: search_tags, then live music and clubs, cards", async () => {
    const { result, events } = await ask(COUPLE_GUEST, DEMO_QUESTIONS.musicTonight);
    const tools = events.flatMap((e) => (e.type === "status" ? [e.tool] : []));
    expect(tools).toEqual(["search_tags", "recommend_places", "show_cards"]);
    expect(ids(result.cards)).toEqual(["FIX-P-024", "FIX-P-025", "FIX-P-012"]);
    expect(result.seen.length).toBeGreaterThanOrEqual(3);
  });

  it("streams text and cards, logs every model call, and sends no personal data to Qloo", async () => {
    const { events, logs, requests } = await ask(COUPLE_GUEST, DEMO_QUESTIONS.romanticDinner);
    const kinds = events.map((e) => e.type);
    expect(kinds.indexOf("cards")).toBeLessThan(kinds.lastIndexOf("text"));
    const text = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
    expect(text).toBe(
      "Three relaxed places for dinner tonight, none of them pricey. People with your taste in music rate all three.",
    );
    const calls = logs.filter((l) => !l.error);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      provider: "openai",
      endpoint: "responses.stream (concierge)",
      params: { model: MODEL, effort: "low", iteration: 1, tools: ["recommend_places"] },
    });
    expect(JSON.stringify(requests)).not.toContain(COUPLE_GUEST.firstName);
  });

  it("picks the fixture turn by the guest's message and the step", () => {
    const user = { role: "user", content: DEMO_QUESTIONS.musicTonight };
    const context = { role: "developer", content: "<guest_context>…</guest_context>" };
    expect(pickTurn({ input: [context, user] }).conversation.name).toBe("music-tonight");
    const step2 = pickTurn({
      input: [
        context,
        user,
        { type: "reasoning" },
        { type: "function_call" },
        { type: "function_call_output" },
      ],
    });
    expect(step2.turn.output[0]).toMatchObject({ name: "recommend_places" });
    expect(pickTurn({ input: [{ role: "user", content: "Hello" }] }).conversation.name).toBe(
      "fallback",
    );
  });

  it("sends strict tools after a cached, stable prefix and returns every call's result", async () => {
    const { client, requests } = fakeOpenAI(async (body) => {
      const { turn } = pickTurn(body as Parameters<typeof pickTurn>[0]);
      return new Response(streamTurn(turn, MODEL, String(requests.length), 0), {
        headers: { "content-type": "text/event-stream" },
      });
    });
    await runConciergeTurn({
      llm: createOpenAIProvider(client, MODEL),
      data: conciergeData(FAMILY_GUEST),
      history: [],
      message: DEMO_QUESTIONS.rainyKids,
      emit: () => {},
      qloo: mockQloo().client,
      now: () => Date.UTC(2026, 9, 24, 18),
    });
    expect(requests).toHaveLength(3);
    const [first, second] = requests as Array<{
      instructions: string;
      tools: Array<{ name: string; strict: boolean }>;
      input: Array<{ role?: string; type?: string; call_id?: string; output?: string }>;
    }>;
    expect(first).toMatchObject({
      model: MODEL,
      instructions: CONCIERGE_SYSTEM_PROMPT,
      tool_choice: "auto",
      reasoning: { effort: "low" },
      store: false,
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: "host-brain-concierge",
      stream: true,
    });
    expect(first.tools.every((tool) => tool.strict)).toBe(true);
    // The same prefix on every step of the turn.
    expect(JSON.stringify([second.instructions, second.tools])).toBe(
      JSON.stringify([first.instructions, first.tools]),
    );
    expect(first.input[0].role).toBe("developer");
    expect(first.input[0]).not.toHaveProperty("content", expect.stringContaining("Zelda"));
    // Both calls of step 1 come back with their outputs, matched by call_id.
    const outputs = second.input.filter((item) => item.type === "function_call_output");
    const calls = second.input.filter((item) => item.type === "function_call");
    expect(outputs.map((o) => o.call_id)).toEqual(calls.map((c) => c.call_id));
    expect(outputs).toHaveLength(2);
  });
});

describe("concierge fallbacks", () => {
  const run = (llm: ReturnType<typeof createOpenAIProvider> | null) => {
    const events: ChatEvent[] = [];
    const logs: LlmLogEntry[] = [];
    return runConciergeTurn({
      llm,
      data: conciergeData(COUPLE_GUEST),
      history: [],
      message: "Tell me something off-topic",
      emit: (event) => events.push(event),
      log: async (entry) => void logs.push(entry),
      qloo: mockQloo().client,
    }).then((result) => ({ result, events, logs }));
  };

  it("answers with the refusal line when the model declines", async () => {
    const { result, events } = await run(
      llmFor({
        status: "completed",
        output: [
          { type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No." }] },
        ],
      }).llm,
    );
    expect(result.source).toBe("refusal");
    expect(result.text).toMatch(/^Sorry, I can’t help with that one/);
    expect(events.at(-1)).toEqual({ type: "replace", text: result.text });
  });

  it("answers politely without a key", async () => {
    const { result } = await run(null);
    expect(result.source).toBe("offline");
    expect(result.cards).toEqual([]);
  });

  it("says sorry when the API fails, and logs the status", async () => {
    const { client } = fakeOpenAI(() =>
      Response.json(
        {
          error: { message: "Bad request", type: "invalid_request_error", code: null, param: null },
        },
        { status: 400 },
      ),
    );
    const { result, logs } = await run(createOpenAIProvider(client, MODEL));
    expect(result.source).toBe("error");
    expect(result.text).toMatch(/^Sorry, I couldn’t finish that/);
    expect(logs[0]).toMatchObject({ status: 400, error: expect.stringMatching(/Bad request/) });
  });

  it("asks once for show_cards when the model recommends without cards", async () => {
    const places = JSON.stringify({
      category: "eat",
      extra_tags: null,
      radius_m: null,
      price: null,
      count: 3,
    });
    const say = (text: string): FixtureTurn => ({
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
    });
    // Step 3 shows the first place step 1 returned, read from the tool result it was sent.
    const firstPlace = (body: Record<string, unknown>) => {
      const result = (body.input as Array<{ type?: string; output?: string }>).find(
        (item) => item.type === "function_call_output",
      );
      return JSON.parse(result!.output!).places[0].entity_id as string;
    };
    let shownId = "";
    const turns: Array<(body: Record<string, unknown>) => FixtureTurn> = [
      () => ({
        status: "completed",
        output: [{ type: "function_call", name: "recommend_places", arguments: places }],
      }),
      () => say("These spots are great, tap a card."),
      (body) => {
        shownId = firstPlace(body);
        return {
          status: "completed",
          output: [
            {
              type: "function_call",
              name: "show_cards",
              arguments: JSON.stringify({
                items: [{ entity_id: shownId, reason: "Popular with people who love Mara Solé" }],
              }),
            },
          ],
        };
      },
      () => say("Here is one to try."),
    ];
    const { client, requests } = fakeOpenAI(
      (body) =>
        new Response(streamTurn(turns[requests.length - 1](body), MODEL, "nudge", 0), {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const { result, events } = await run(createOpenAIProvider(client, MODEL));
    expect(requests).toHaveLength(4);
    const third = requests[2].input as Array<{ role?: string; content?: unknown }>;
    expect(third.at(-1)).toEqual({ role: "developer", content: SHOW_CARDS_NUDGE });
    expect(result.source).toBe("llm");
    expect(shownId).toMatch(/^FIX-P-/);
    expect(result.cards.map((c) => c.item.entity_id)).toEqual([shownId]);
    // The text about cards that didn't exist is replaced by the final sentence.
    expect(result.text).toBe("Here is one to try.");
    expect(events).toContainEqual({ type: "replace", text: "" });
  });

  it(`stops after ${MAX_ITERATIONS} model calls, and bad arguments go back as errors`, async () => {
    const { llm, requests } = llmFor({
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "recommend_places",
          arguments: JSON.stringify({
            category: "eat",
            extra_tags: null,
            radius_m: null,
            price: null,
            count: 9,
          }),
        },
      ],
    });
    const { result, logs } = await run(llm);
    expect(requests).toHaveLength(MAX_ITERATIONS);
    expect(logs.filter((l) => !l.error)).toHaveLength(MAX_ITERATIONS);
    const outputs = (requests.at(-1)!.input as Array<{ type?: string; output?: string }>).filter(
      (item) => item.type === "function_call_output",
    );
    expect(outputs[0].output).toMatch(/Invalid input/);
    expect(result.source).toBe("error");
    expect(result.cards).toEqual([]);
  });
});
