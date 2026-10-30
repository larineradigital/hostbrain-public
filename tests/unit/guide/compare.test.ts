import { describe, expect, it, vi } from "vitest";

import { createCompareReplayClient, pickAnswer } from "@/lib/ai/compare-replay";
import { createOpenAIProvider } from "@/lib/ai/openai";
import {
  askAiAlone,
  cleanAiNames,
  describeGuest,
  genericNames,
  namesMatch,
  normalizeName,
  summarizeComparison,
  verifyAiPicks,
  VERIFY_RADIUS_M,
  type AiAlonePick,
} from "@/lib/guide/compare";
import type { LlmLogEntry } from "@/lib/guide/store";
import { createQlooClient } from "@/lib/qloo/client";
import { QlooError } from "@/lib/qloo/errors";
import { createMemoryQlooStore } from "@/lib/qloo/store";
import { COUPLE_GUEST, DEMO_PROPERTY, FAMILY_GUEST } from "@/tests/fixtures/concierge-guests";
import { fakeOpenAI } from "@/tests/unit/ai/helpers";

const pick = (name: string, status: AiAlonePick["status"] = "verified"): AiAlonePick => ({
  name,
  status,
  entity_id: status === "verified" ? `FIX-${name}` : null,
  qloo_name: status === "verified" ? name : null,
  distance_m: status === "verified" ? 400 : null,
});
const item = (entity_id: string, distance_m: number | null = 500) => ({ entity_id, distance_m });

describe("summarizeComparison", () => {
  it("counts verified, not found and unchecked AI-alone picks", () => {
    const summary = summarizeComparison({
      aiAlone: [
        pick("Casa Marmelo"),
        pick("Lantern & Ladle"),
        pick("The Tram Stop Tavern", "not_found"),
        pick("Sardine Story Kitchen", "not_found"),
        pick("Harbour Lights Bistro", "not_found"),
        pick("Vinho Fantasma", "unchecked"),
      ],
      qlooEat: [item("FIX-P-001"), item("FIX-P-002")],
      otherAiAlone: [],
      otherQlooEat: [],
    });
    expect(summary.ai).toEqual({ picks: 6, verified: 2, notFound: 3, unchecked: 1, generic: 0 });
    expect(summary.others).toEqual({ ai: 0, qloo: 0 });
  });

  it("counts generic AI picks across other guests, ignoring case, accents and articles", () => {
    const summary = summarizeComparison({
      aiAlone: [pick("Casa Marmelo"), pick("The Tram Stop Tavern"), pick("Pastel Palace")],
      qlooEat: [],
      otherAiAlone: [[pick("casa marmelo"), pick("Somewhere Else")], [pick("Tram Stop Tavern")]],
      otherQlooEat: [],
    });
    expect(summary.ai.generic).toBe(2);
    expect(summary.others.ai).toBe(2);
  });

  it("counts Qloo picks within the verify radius and those unique to this guest", () => {
    const summary = summarizeComparison({
      aiAlone: [],
      qlooEat: [
        item("FIX-P-001", 120),
        item("FIX-P-002", VERIFY_RADIUS_M),
        item("FIX-P-003", VERIFY_RADIUS_M + 1),
        item("FIX-P-004", null),
      ],
      otherAiAlone: [],
      otherQlooEat: [["FIX-P-001"], ["FIX-P-001", "FIX-P-003", "FIX-P-099"]],
    });
    expect(summary.qloo).toEqual({ picks: 4, verified: 2, unique: 2 });
    expect(summary.others.qloo).toBe(2);
  });

  it("handles empty lists", () => {
    const summary = summarizeComparison({
      aiAlone: [],
      qlooEat: [],
      otherAiAlone: [],
      otherQlooEat: [],
    });
    expect(summary).toEqual({
      ai: { picks: 0, verified: 0, notFound: 0, unchecked: 0, generic: 0 },
      qloo: { picks: 0, verified: 0, unique: 0 },
      others: { ai: 0, qloo: 0 },
    });
  });

  it("lists the generic names as the model wrote them", () => {
    expect(genericNames([pick("Café Lua"), pick("Casa Marmelo")], [[pick("CAFE LUA")]])).toEqual([
      "Café Lua",
    ]);
  });
});

describe("name matching", () => {
  it("normalises case, accents, punctuation, '&' and a leading article", () => {
    expect(normalizeName("The Cork Atlas")).toBe("cork atlas");
    expect(normalizeName("  Café  Lúa! ")).toBe("cafe lua");
    expect(normalizeName("Lantern & Ladle")).toBe("lantern and ladle");
  });

  it("accepts the same place and rejects a different one with a shared word", () => {
    expect(namesMatch("Lantern and Ladle", "Lantern & Ladle")).toBe(true);
    expect(namesMatch("Cork Atlas", "The Cork Atlas")).toBe(true);
    expect(namesMatch("Ondas Grill", "Ondas Grill House")).toBe(true);
    expect(namesMatch("Casa Lua", "Casa Marmelo")).toBe(false);
    expect(namesMatch("The Grill", "Ondas Grill House")).toBe(true);
    expect(namesMatch("Grill Palace Tower", "Ondas Grill House")).toBe(false);
    expect(namesMatch("", "Anything")).toBe(false);
  });

  it("cleans the model's names: trims, dedupes, drops long ones, keeps 6", () => {
    expect(
      cleanAiNames([
        " Casa  Marmelo ",
        "casa marmelo",
        "",
        "x".repeat(81),
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
      ]),
    ).toEqual(["Casa Marmelo", "A", "B", "C", "D", "E"]);
  });
});

describe("describeGuest", () => {
  const context = (guest: typeof COUPLE_GUEST, skipped = false) => ({
    guide: {
      id: "g",
      token: "t",
      status: "ready" as const,
      partyType: guest.partyType,
      ageBand: guest.ageBand,
      guestFirstName: guest.firstName,
    },
    quiz: {
      artistIds: guest.quiz.artist_ids,
      artistNames: guest.quiz.artist_names,
      mediaIds: guest.quiz.media_ids,
      mediaNames: guest.quiz.media_names,
      tagUrns: guest.quiz.tag_urns,
      tagLabels: guest.quiz.tag_labels,
      dietary: guest.quiz.dietary,
      skipped,
    },
  });

  it("describes taste without the guest's name", () => {
    const text = describeGuest(context(COUPLE_GUEST));
    expect(text).toContain("a couple aged 30 to 34 who love Mara Solé");
    expect(text).toContain("Mara Solé");
    expect(text).toContain("natural wine");
    expect(text).not.toContain(COUPLE_GUEST.firstName);
  });

  it("uses party type and age only for a skipped quiz", () => {
    expect(describeGuest(context(FAMILY_GUEST, true))).toBe("a family with children aged 35 to 44");
  });
});

describe("verifyAiPicks (mock Qloo)", () => {
  const near = { lat: DEMO_PROPERTY.lat, lng: DEMO_PROPERTY.lng };
  const client = () =>
    createQlooClient({
      mode: "mock",
      baseUrl: "https://qloo.test",
      store: createMemoryQlooStore(),
    });

  it("verifies places within 2 km and reports the rest as not found", async () => {
    const picks = await verifyAiPicks(
      ["Casa Marmelo", "Harbour Lights Bistro", "The Tram Stop Tavern"],
      near,
      { client: client() },
    );
    expect(picks[0]).toMatchObject({ status: "verified", entity_id: "FIX-P-002" });
    expect(picks[0].distance_m).toBeLessThanOrEqual(VERIFY_RADIUS_M);
    // 3.8 km away in the fixtures: real, but not near the property.
    expect(picks[1]).toMatchObject({ status: "not_found", entity_id: null });
    expect(picks[2]).toMatchObject({ status: "not_found", entity_id: null });
  });

  it("marks a failed Qloo call as unchecked, not as not found", async () => {
    const find = vi.fn(async () => {
      throw new QlooError("network", "offline");
    });
    const [result] = await verifyAiPicks(["Casa Marmelo"], near, { find });
    expect(result.status).toBe("unchecked");
  });
});

describe("askAiAlone", () => {
  const input = {
    guest: "a couple who love Mara Solé",
    address: "12 Fable Street",
    city: "Lisbon",
  };

  it("says no_key without an LLM", async () => {
    expect(await askAiAlone(input, { llm: null, guideId: "g" })).toEqual({
      ok: false,
      reason: "no_key",
    });
  });

  it("parses the replay fixture through the real SDK and logs one call", async () => {
    const logs: LlmLogEntry[] = [];
    const result = await askAiAlone(input, {
      llm: createOpenAIProvider(createCompareReplayClient(), "gpt-6.1-sol"),
      guideId: "g",
      log: async (entry) => void logs.push(entry),
    });
    expect(result).toMatchObject({ ok: true, names: expect.arrayContaining(["Casa Marmelo"]) });
    expect(result.ok && result.names).toHaveLength(6);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      provider: "openai",
      endpoint: "responses.parse (compare)",
      status: 200,
      params: { model: "gpt-6.1-sol", effort: "low", picks: 6 },
    });
    expect(JSON.stringify(logs[0].params)).not.toContain("Mara");
  });

  it("asks with a strict schema, low effort and one retry, and fails cleanly on an API error", async () => {
    const { client, requests } = fakeOpenAI(() =>
      Response.json(
        {
          error: { message: "Bad request", type: "invalid_request_error", code: null, param: null },
        },
        { status: 400 },
      ),
    );
    const logs: LlmLogEntry[] = [];
    expect(
      await askAiAlone(input, {
        llm: createOpenAIProvider(client, "m"),
        guideId: "g",
        log: async (entry) => void logs.push(entry),
      }),
    ).toEqual({ ok: false, reason: "failed" });
    expect(requests[0]).toMatchObject({
      reasoning: { effort: "low" },
      store: false,
      text: { format: { type: "json_schema", name: "restaurants", strict: true } },
    });
    expect(requests[0].input).toContain("12 Fable Street, Lisbon");
    expect(logs[0]).toMatchObject({ status: 400 });
  });

  it("picks fixture answers by guest, sharing three names between the two demo guests", () => {
    const ask = (guest: string) =>
      pickAnswer({ input: `restaurants for ${guest}` }).output_parsed.restaurants.map(
        (r) => r.name,
      );
    const couple = ask("who love Mara Solé");
    const family = ask("who love Kito & the Kites");
    expect(couple).not.toEqual(family);
    expect(couple.filter((name) => family.includes(name))).toHaveLength(3);
  });
});
