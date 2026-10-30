import { describe, expect, it } from "vitest";

import {
  chunkItems,
  displayCasing,
  fallbackLine,
  LIMITS,
  mergeWritings,
  sectionPayload,
  validateSectionOutput,
  writeGuide,
  writeSection,
  WRITER_SYSTEM_PROMPT,
  type SectionOutput,
  type WriterInput,
  type WriterOptions,
} from "@/lib/ai/writer";
import { createOpenAIProvider } from "@/lib/ai/openai";
import type { LlmLogEntry } from "@/lib/guide/store";

import { fakeOpenAI, refusalItem, RESPONSE_USAGE, responseBody, textItem } from "./helpers";

const input: WriterInput = {
  city: "Lisbon",
  party_type: "couple",
  age_band: "30_to_34",
  signals: { artists: ["Mara Solé"], media: ["A Quiet Tram to Nowhere"], tags: ["Natural wine"] },
  dietary: ["vegetarian"],
  sections: [
    {
      section: "eat",
      items: [
        item("FIX-P-001", { driven_by: ["Mara Solé"] }),
        item("FIX-P-002", { matched_tags: ["Natural wine"] }),
        item("FIX-P-003"),
      ],
    },
    {
      section: "playlist",
      items: [item("FIX-A-003", { category: "Electronic", driven_by: ["Mara Solé"] })],
    },
  ],
};
const eat = input.sections[0];

function item(
  entity_id: string,
  extra: Partial<WriterInput["sections"][number]["items"][number]> = {},
) {
  return {
    entity_id,
    name: `Place ${entity_id}`,
    category: "Restaurant",
    qloo_tags: ["Restaurant"],
    driven_by: [],
    matched_tags: [],
    ...extra,
  };
}

const MODEL = "gpt-6.1-sol";

/** The real OpenAI provider over a fake `fetch` that answers every call with `reply`. */
function writerWith(reply: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const { client, requests } = fakeOpenAI(reply);
  const logs: LlmLogEntry[] = [];
  const options = {
    llm: createOpenAIProvider(client, MODEL),
    guideId: "guide-1",
    log: async (entry: LlmLogEntry) => void logs.push(entry),
  } satisfies WriterOptions;
  return { options, requests, logs };
}

const ok = (output: unknown, extra?: Parameters<typeof responseBody>[1]) => () =>
  Response.json(responseBody([textItem(JSON.stringify(output))], extra));

const good: SectionOutput = {
  hero_line: "Slow evenings and natural wine around the old harbour",
  intro: "Kitchens near you that people with your taste keep going back to",
  lines: [
    { ref: "1", why_you: "Popular with people who love Mara Solé" },
    { ref: "2", why_you: "x".repeat(LIMITS.whyYou + 1) }, // too long → fallback
    { ref: "9", why_you: "A place the model made up" }, // unknown → dropped
    { ref: "FIX-P-003", why_you: "An entity ID instead of a ref" }, // not a ref → dropped
  ],
};

describe("writeSection", () => {
  it("sends one strict structured-output call with refs instead of entity IDs", async () => {
    const { options, requests, logs } = writerWith(ok(good));
    const result = await writeSection(input, eat, { ...options, hero: true });

    expect(requests).toHaveLength(1);
    const [params] = requests;
    expect(params).toMatchObject({
      model: MODEL,
      instructions: WRITER_SYSTEM_PROMPT,
      reasoning: { effort: "low" },
      store: false,
      prompt_cache_key: "host-brain-guide_lines",
      text: { format: { type: "json_schema", name: "guide_lines", strict: true } },
    });
    expect(params).not.toHaveProperty("tools");
    const sent = JSON.parse(params.input as string);
    expect(sent).toMatchObject({ city: "Lisbon", section: "eat", write_hero: true });
    expect(sent.items).toEqual([
      {
        ref: "1",
        name: "Place FIX-P-001",
        category: "Restaurant",
        tags: ["Restaurant"],
        driven_by: ["Mara Solé"],
      },
      {
        ref: "2",
        name: "Place FIX-P-002",
        category: "Restaurant",
        tags: ["Restaurant"],
        matched_tags: ["Natural wine"],
      },
      { ref: "3", name: "Place FIX-P-003", category: "Restaurant", tags: ["Restaurant"] },
    ]);
    for (const sentItem of sent.items) expect(sentItem).not.toHaveProperty("entity_id");

    expect(result.source).toBe("llm");
    expect(result.heroLine).toBe(good.hero_line);
    expect(result.intro).toBe(good.intro);
    expect(result.lines).toEqual({
      "FIX-P-001": "Popular with people who love Mara Solé",
      "FIX-P-002": "Matches your taste for natural wine",
      "FIX-P-003": "A well-loved restaurant near your stay",
    });
    expect(result.stats).toEqual({ dropped: 3, filled: 2 });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      provider: "openai",
      endpoint: "responses.parse (writer)",
      status: 200,
      params: {
        model: MODEL,
        effort: "low",
        section: "eat",
        items: 3,
        hero: true,
        served_by: "gpt-test-2026-10-01",
        stop_reason: "completed",
        usage: RESPONSE_USAGE,
      },
    });
    expect(JSON.stringify(logs)).not.toContain("Mara Solé");
  });

  it("ignores a hero line it wasn't asked for", async () => {
    const { options } = writerWith(ok(good));
    const result = await writeSection(input, eat, options);
    expect(result.heroLine).toBeNull();
  });

  it("falls back to template lines when the model refuses", async () => {
    const { options, logs } = writerWith(() =>
      Response.json(responseBody([refusalItem("I can't help with that.")])),
    );
    const result = await writeSection(input, eat, { ...options, hero: true });
    expect(result.source).toBe("fallback");
    expect(result.heroLine).toBe("Your Lisbon, picked for your taste");
    expect(result.lines["FIX-P-001"]).toBe("Popular with people who love Mara Solé");
    expect(logs[0].error).toMatch(/refusal/);
  });

  it("falls back when the output was cut off", async () => {
    const { options, logs } = writerWith(
      ok(good, { status: "incomplete", reason: "max_output_tokens" }),
    );
    const result = await writeSection(input, eat, options);
    expect(result.source).toBe("fallback");
    expect(logs[0].error).toMatch(/max_output_tokens/);
  });

  it("falls back, logs the status and doesn't retry on an API error", async () => {
    const { options, logs, requests } = writerWith(() =>
      Response.json(
        { error: { message: "Overloaded", type: "server_error", code: null, param: null } },
        { status: 503 },
      ),
    );
    const result = await writeSection(input, eat, options);
    expect(result.source).toBe("fallback");
    expect(Object.keys(result.lines)).toEqual(["FIX-P-001", "FIX-P-002", "FIX-P-003"]);
    expect(requests).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 503, error: expect.stringMatching(/Overloaded/) });
  });

  it("falls back on a network error", async () => {
    const { options, logs } = writerWith(() => {
      throw new TypeError("fetch failed");
    });
    const result = await writeSection(input, eat, options);
    expect(result.source).toBe("fallback");
    expect(logs[0]).toMatchObject({ status: null, error: expect.stringMatching(/Connection/) });
  });

  it("makes no call without an LLM (mock mode)", async () => {
    const result = await writeSection(input, eat, { llm: null, guideId: "guide-1" });
    expect(result.source).toBe("fallback");
    expect(result.intro).toBe("Places to eat near you, picked for your taste");
  });

  it("a failing logger doesn't discard a good answer", async () => {
    const { options } = writerWith(ok(good));
    const result = await writeSection(input, eat, {
      ...options,
      log: async () => {
        throw new Error("db down");
      },
    });
    expect(result.source).toBe("llm");
  });
});

describe("writeSection chunks", () => {
  it("splits a long section into parallel calls and maps each chunk's refs back", async () => {
    const long = {
      section: "playlist" as const,
      items: Array.from({ length: 12 }, (_, i) => item(`FIX-A-${100 + i}`)),
    };
    const { options, requests, logs } = writerWith((body) => {
      const sent = JSON.parse(body.input as string);
      return ok({
        hero_line: sent.write_hero ? "A soundtrack for Lisbon" : null,
        intro: `Intro starting at ${sent.items[0].name}`,
        lines: sent.items.map((i: { ref: string; name: string }) => ({
          ref: i.ref,
          why_you: `Line for ${i.name}`,
        })),
      })();
    });
    const result = await writeSection(input, long, { ...options, hero: true });

    const sent = requests.map((r) => JSON.parse(r.input as string));
    expect(sent.map((p) => p.items.length)).toEqual([4, 4, 4]);
    expect(sent.map((p) => p.write_hero)).toEqual([true, false, false]);
    expect(sent.every((p) => p.items[0].ref === "1")).toBe(true);
    expect(result.heroLine).toBe("A soundtrack for Lisbon");
    expect(result.intro).toBe("Intro starting at Place FIX-A-100");
    expect(Object.keys(result.lines)).toEqual(long.items.map((i) => i.entity_id));
    for (const it of long.items) expect(result.lines[it.entity_id]).toBe(`Line for ${it.name}`);
    expect(logs.map((l) => l.params.chunk).sort()).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("chunks evenly", () => {
    const sizes = (n: number) =>
      chunkItems(Array.from({ length: n }, (_, i) => i)).map((c) => c.length);
    expect(sizes(5)).toEqual([5]);
    expect(sizes(6)).toEqual([3, 3]);
    expect(sizes(15)).toEqual([5, 5, 5]);
    expect(sizes(11)).toEqual([4, 4, 3]);
  });
});

describe("writeGuide", () => {
  it("writes every section in its own parallel call, the hero line only in the first", async () => {
    const { options, requests } = writerWith((body) => {
      const sent = JSON.parse(body.input as string);
      return ok({
        hero_line: sent.write_hero ? "Lisbon at your own pace" : "Not asked for",
        intro: `Intro for ${sent.section}`,
        lines: sent.items.map((i: { ref: string }) => ({ ref: i.ref, why_you: `Line ${i.ref}` })),
      })();
    });
    const result = await writeGuide(input, options);

    expect(requests).toHaveLength(2);
    expect(requests.map((r) => JSON.parse(r.input as string).write_hero)).toEqual([true, false]);
    expect(result.source).toBe("llm");
    expect(result.heroLine).toBe("Lisbon at your own pace");
    expect(result.intros).toEqual({ eat: "Intro for eat", playlist: "Intro for playlist" });
    expect(result.lines.playlist).toEqual({ "FIX-A-003": "Line 1" });
    expect(result.lines.eat).toEqual({
      "FIX-P-001": "Line 1",
      "FIX-P-002": "Line 2",
      "FIX-P-003": "Line 3",
    });
    expect(result.stats).toEqual({ dropped: 0, filled: 0 });
  });

  it("reports mixed sources when one section falls back", async () => {
    const { options } = writerWith((body) => {
      const sent = JSON.parse(body.input as string);
      if (sent.section === "playlist") throw new TypeError("fetch failed");
      return ok(good)();
    });
    const result = await writeGuide(input, options);
    expect(result.source).toBe("mixed");
    expect(result.lines.playlist).toEqual({ "FIX-A-003": "Popular with fans of Mara Solé" });
  });
});

describe("validateSectionOutput", () => {
  it("strips emojis and keeps the first line for a repeated ref", () => {
    const result = validateSectionOutput(
      {
        hero_line: "Lisbon, your way 🌞",
        intro: "Good food 🍷 nearby",
        lines: [
          { ref: "1", why_you: "First 🍷 line" },
          { ref: "1", why_you: "A second line for the same item" },
        ],
      },
      input,
      eat,
      true,
    );
    expect(result.heroLine).toBe("Lisbon, your way");
    expect(result.intro).toBe("Good food nearby");
    expect(result.lines["FIX-P-001"]).toBe("First line");
    expect(result.stats).toEqual({ dropped: 1, filled: 2 });
  });

  it("sends display casing and puts it back when the model copies capitals", () => {
    const loud = {
      ...input,
      signals: { ...input.signals, artists: ["MARA SOLÉ"] },
    };
    const part = {
      section: "eat" as const,
      items: [item("FIX-P-001", { driven_by: ["MARA SOLÉ"] })],
    };
    const payload = sectionPayload(loud, part, false);
    expect(payload.signals.artists).toEqual(["Mara Solé"]);
    expect(payload.items[0].driven_by).toEqual(["Mara Solé"]);
    const result = validateSectionOutput(
      {
        hero_line: null,
        intro: "For fans of MARA SOLÉ",
        lines: [{ ref: "1", why_you: "Popular with people who love MARA SOLÉ" }],
      },
      loud,
      part,
      false,
    );
    expect(result.intro).toBe("For fans of Mara Solé");
    expect(result.lines["FIX-P-001"]).toBe("Popular with people who love Mara Solé");
    expect(fallbackLine("eat", part.items[0], loud)).toBe("Popular with people who love Mara Solé");
    expect(displayCasing(input, [])("ABBA and A QUIET TRAM TO NOWHERE")).toBe(
      "ABBA and A Quiet Tram to Nowhere",
    );
  });

  it("family fallbacks never mention bars", () => {
    expect(
      validateSectionOutput(
        null,
        { ...input, party_type: "family" },
        { section: "drink", items: [] },
        false,
      ).intro,
    ).toBe("Cafés and sweet stops nearby");
  });

  it("merging with no sections gives the fallback hero", () => {
    expect(mergeWritings(input, [])).toMatchObject({
      heroLine: "Your Lisbon, picked for your taste",
      source: "fallback",
    });
  });

  it("fallback lines stay within the limit", () => {
    const long = item("FIX-P-009", {
      driven_by: ["A".repeat(80), "B".repeat(80)],
      category: "C".repeat(120),
    });
    expect(fallbackLine("eat", long, input).length).toBeLessThanOrEqual(LIMITS.whyYou);
  });
});
