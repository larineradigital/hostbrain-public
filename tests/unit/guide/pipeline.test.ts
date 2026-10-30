import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ createServiceClient: vi.fn() }));

import { writeSection, type WriterContext, type WriterSection } from "@/lib/ai/writer";
import {
  assignPlaces,
  generateGuide,
  GuideBusyError,
  SECTION_RULES,
  WIDE_RADIUS_M,
  type Candidate,
  type PipelineDeps,
} from "@/lib/guide/pipeline";
import { isAlcoholThemed } from "@/lib/guide/family-filter";
import { PLACE_SECTIONS, type GenerationEvent } from "@/lib/guide/types";
import type { QlooClient } from "@/lib/qloo/client";
import { QlooError } from "@/lib/qloo/errors";
import type { QlooEntity } from "@/lib/qloo/schemas";
import places from "@/tests/fixtures/qloo/places.json";

import { GUEST_NAME, GUIDE_ID, guideContext, memoryGuideStore, mockQloo } from "./helpers";

const fixturePlaces = new Map(
  places.map((p) => [p.id, { name: p.name, tags: p.tags.map((id) => ({ id })) }]),
);

function setup(context = guideContext(), { busy = false, qloo = mockQloo().client } = {}) {
  const store = memoryGuideStore(context, { busy });
  const writerInputs: Array<{ context: WriterContext; part: WriterSection; hero: boolean }> = [];
  const deps: PipelineDeps = {
    store,
    qloo,
    // The real writer with no LLM: template lines only.
    writer: (context, part, guideId, { hero }) => {
      writerInputs.push({ context, part, hero });
      return writeSection(context, part, { llm: null, guideId, hero });
    },
  };
  const events: GenerationEvent[] = [];
  return {
    store,
    deps,
    events,
    writerInputs,
    run: () => generateGuide(GUIDE_ID, (e) => events.push(e), deps),
  };
}

const section = (store: ReturnType<typeof memoryGuideStore>, kind: string) =>
  store.saved!.sections.find((s) => s.section === kind)!;

describe("generateGuide (mock Qloo)", () => {
  it("fills every section with Qloo IDs, each place in one section, and marks the guide ready", async () => {
    const qloo = mockQloo();
    const { store, events, run } = setup(guideContext(), { qloo: qloo.client });
    await run();

    expect(store.failed).toBeNull();
    for (const kind of PLACE_SECTIONS) {
      expect(section(store, kind).items).toHaveLength(SECTION_RULES[kind].min);
    }
    expect(section(store, "playlist").items.length).toBeGreaterThanOrEqual(10);
    expect(section(store, "films").items).toHaveLength(5);
    expect(section(store, "shows").items).toHaveLength(3);
    expect(store.saved!.heatmap!.length).toBeGreaterThan(50);

    // Every place appears once across Eat, Drink, Do and Rainy.
    const placeIds = PLACE_SECTIONS.flatMap((k) => section(store, k).items.map((i) => i.entity_id));
    expect(new Set(placeIds).size).toBe(placeIds.length);

    // Every item is an entity a Qloo call returned for this guide.
    const returned = new Set<string>();
    collectIds(qloo.responses, returned);
    const all = store.saved!.sections.flatMap((s) => s.items);
    expect(all.length).toBeGreaterThan(30);
    for (const item of all) expect(returned).toContain(item.entity_id);

    // The guest's own picks never come back as recommendations.
    expect(section(store, "playlist").items.map((i) => i.entity_id)).not.toContain("FIX-A-001");
    expect(section(store, "films").items.map((i) => i.entity_id)).not.toContain("FIX-M-001");

    // Every card has a line, a distance for places and the Qloo signals behind it.
    expect(all.every((i) => i.why_you.length > 0 && i.why_you.length <= 110)).toBe(true);
    for (const kind of PLACE_SECTIONS) {
      for (const item of section(store, kind).items) {
        expect(item.distance_m).not.toBeNull();
        expect(item.distance_m!).toBeLessThanOrEqual(2000);
        expect(item.category).toBeTruthy();
      }
    }
    expect(
      all.some((i) => i.explain.length > 0 && i.signals_used.includes(i.explain[0].name)),
    ).toBe(true);
    expect(section(store, "eat").qlooRequest).toMatchObject({ radius_m: 2000 });

    expect(events.at(-1)).toEqual({
      type: "done",
      guideId: GUIDE_ID,
      token: "tok_abcdefghijklmnopq",
    });
    expect(events.find((e) => e.type === "step" && e.step === "eat")).toMatchObject({
      label: "Finding restaurants near 12 Fable Street that fit you",
    });
  });

  it("never sends the guest's name to Qloo or the writer", async () => {
    const qloo = mockQloo();
    const { writerInputs, run } = setup(guideContext(), { qloo: qloo.client });
    await run();
    // Eat, Drink, Do, Rainy, artists, movies, shows, heatmap, audience (no host picks here).
    expect(qloo.store.logs).toHaveLength(9);
    expect(JSON.stringify(qloo.store.logs)).not.toContain(GUEST_NAME);
    expect(JSON.stringify(writerInputs)).not.toContain(GUEST_NAME);
    expect(qloo.store.logs.every((l) => l.guideId === GUIDE_ID)).toBe(true);
  });

  it("writes each section in its own call, the hero line once, and stores the audience band", async () => {
    const { store, events, writerInputs, run } = setup();
    const result = await run();

    const written = writerInputs.map((w) => w.part.section).sort();
    expect(written).toEqual(["do", "drink", "eat", "films", "playlist", "rainy", "shows"]);
    expect(writerInputs.filter((w) => w.hero).map((w) => w.part.section)).toEqual(["eat"]);
    for (const { part } of writerInputs) {
      const saved = section(store, part.section).items.map((i) => i.entity_id);
      expect(part.items.map((i) => i.entity_id)).toEqual(saved);
    }
    expect(store.saved!.heroLine).toBe("Your Lisbon, picked for your taste");
    expect(result.writer).toBe("fallback");

    // Q11 from the guest's picks only, averaged: one of Qloo's demographic bands (or none).
    expect(
      store.saved!.audienceAgeBand === null || /^[a-z0-9_]+$/.test(store.saved!.audienceAgeBand),
    ).toBe(true);
    expect(result.audienceAgeBand).toBe(store.saved!.audienceAgeBand);

    // "Writing" starts after the place sections are in and ends before saving.
    const steps = events.flatMap((e) => (e.type === "step" ? [`${e.step}:${e.status}`] : []));
    const at = (key: string) => steps.indexOf(key);
    expect(at("writing:active")).toBeGreaterThan(at("eat:done"));
    expect(at("writing:done")).toBeGreaterThan(at("films:done"));
    expect(at("writing:done")).toBeGreaterThan(at("playlist:done"));
    expect(at("saving:active")).toBeGreaterThan(at("writing:done"));
    expect(steps.filter((s) => s === "writing:done")).toHaveLength(1);
  });

  it("asks Qloo for the audience with entity IDs only, and skips it without picks", async () => {
    const qloo = mockQloo();
    const { run } = setup(guideContext(), { qloo: qloo.client });
    await run();
    const audience = qloo.store.logs.filter((l) => l.params["filter.type"] === "urn:demographics");
    expect(audience).toHaveLength(1);
    expect(Object.keys(audience[0].params).sort()).toEqual([
      "filter.type",
      "signal.interests.entities",
    ]);
  });

  it("ranks host picks, keeps them out of other sections and widens Eat to 4 km when short", async () => {
    // Two of the seven restaurants within 2 km are host picks, so Eat has 5 and must widen.
    const context = guideContext({
      hostPicks: [
        { entityId: "FIX-P-001", name: "Lantern & Ladle", note: "Ask for the stew" },
        { entityId: "FIX-P-002", name: "Casa Marmelo", note: null },
        { entityId: "FIX-P-020", name: "Gallery", note: "Free on Sundays" },
        { entityId: "FIX-P-009", name: "Wine bar", note: null },
      ],
    });
    const { store, run } = setup(context);
    await run();

    const picks = section(store, "host_picks").items;
    // Q8 sends no age signal: entity + tag + age together hung for one live profile.
    const q8 = section(store, "host_picks").qlooRequest;
    expect(q8["signal.demographics.age"]).toBeUndefined();
    expect(q8["signal.interests.entities"]).toBeDefined();
    expect(picks.map((i) => i.entity_id).sort()).toEqual([
      "FIX-P-001",
      "FIX-P-002",
      "FIX-P-009",
      "FIX-P-020",
    ]);
    expect(picks.filter((i) => i.top_match)).toHaveLength(3);
    expect(picks.find((i) => i.entity_id === "FIX-P-001")!.host_note).toBe("Ask for the stew");
    const affinities = picks.map((i) => i.affinity ?? 0);
    expect(affinities).toEqual([...affinities].sort((a, b) => b - a));

    const placeIds = PLACE_SECTIONS.flatMap((k) => section(store, k).items.map((i) => i.entity_id));
    for (const pick of context.hostPicks) expect(placeIds).not.toContain(pick.entityId);

    const eat = section(store, "eat");
    expect(eat.qlooRequest).toMatchObject({ radius_m: WIDE_RADIUS_M });
    expect(eat.items).toHaveLength(6);
    expect(eat.items.some((i) => i.distance_m! > 2000)).toBe(true);
    expect(section(store, "drink").qlooRequest).toMatchObject({ radius_m: 2000 });
  });

  it("family guests get no bars or alcohol places, and Drink shows cafés even after widening", async () => {
    const placeIds = (s: ReturnType<typeof setup>["store"]) =>
      ["drink", "do", "rainy"].flatMap((kind) => section(s, kind).items.map((i) => i.entity_id));
    // The fixture beer museum (FIX-P-033) makes a couple's guide…
    const couple = setup();
    await couple.run();
    expect(placeIds(couple.store)).toContain("FIX-P-033");

    // …but not a family's, and nothing else about drinking does either.
    const context = guideContext();
    context.guide.partyType = "family";
    const { store, events, run } = setup(context);
    await run();
    const familyIds = placeIds(store);
    expect(familyIds).not.toContain("FIX-P-033");
    for (const id of familyIds) expect(isAlcoholThemed(fixturePlaces.get(id)!), id).toBe(false);
    const drink = section(store, "drink");
    // Only three cafés exist in the fixtures, so Drink widens and stays below its minimum.
    expect(drink.qlooRequest).toMatchObject({ radius_m: WIDE_RADIUS_M });
    expect(drink.items.length).toBeGreaterThan(0);
    expect(events.find((e) => e.type === "step" && e.step === "drink")).toMatchObject({
      label: "Picking cafés and sweet stops",
    });
  });

  it("a skipped quiz still builds the place sections and hides the taste-only ones", async () => {
    const context = guideContext({
      quiz: {
        artistIds: [],
        artistNames: [],
        mediaIds: [],
        mediaNames: [],
        tagUrns: [],
        tagLabels: [],
        dietary: [],
        skipped: true,
      },
    });
    context.guide.ageBand = null;
    const { store, events, run } = setup(context);
    await run();
    expect(section(store, "eat").items).toHaveLength(6);
    expect(section(store, "playlist").items).toEqual([]);
    expect(section(store, "playlist").intro).toMatch(/artists you love/);
    expect(store.saved!.heatmap).toBeNull();
    expect(store.saved!.audienceAgeBand).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ step: "heatmap", status: "skipped" }));
  });

  it("drops optional sections that miss the deadline but still builds the guide", async () => {
    const qloo = mockQloo();
    const slow: QlooClient = {
      mode: "mock",
      async get(path, params, context) {
        const type = String(params["filter.type"]);
        if (type !== "urn:entity:place" || params["filter.results.entities"]) {
          // Includes the audience call (urn:demographics).
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return qloo.client.get(path, params, context);
      },
    };
    const context = guideContext({
      hostPicks: [{ entityId: "FIX-P-009", name: "Wine bar", note: null }],
    });
    const { store, deps, events } = setup(context, { qloo: slow });
    await generateGuide(GUIDE_ID, (e) => events.push(e), { ...deps, optionalBudgetMs: 50 });

    expect(store.failed).toBeNull();
    expect(section(store, "eat").items).toHaveLength(6);
    for (const kind of ["host_picks", "playlist", "films", "shows"]) {
      expect(section(store, kind).items).toEqual([]);
      expect(section(store, kind).qlooRequest).toEqual({ error: "timed out" });
    }
    expect(store.saved!.heatmap).toBeNull();
    expect(store.saved!.audienceAgeBand).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({ step: "films", status: "done", count: 0 }),
    );
    // Each step reports once, even when the slow call finishes later.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      events.filter((e) => e.type === "step" && e.step === "playlist" && e.status === "done"),
    ).toHaveLength(1);
  });

  it("sends films and music the guest's picks and age, not food or vibe tags", async () => {
    const qloo = mockQloo();
    const { run } = setup(guideContext(), { qloo: qloo.client });
    await run();
    const media = qloo.store.logs.filter((l) =>
      /artist|movie|tv_show/.test(l.params["filter.type"]),
    );
    expect(media).toHaveLength(3);
    for (const log of media) {
      expect(log.params["signal.interests.entities"]).toBe("FIX-A-001,FIX-A-002,FIX-M-001");
      expect(log.params["signal.demographics.age"]).toBe("30_to_34");
      expect(log.params).not.toHaveProperty("signal.interests.tags");
    }
    const eat = qloo.store.logs.find(
      (l) => l.params["filter.tags"] === "urn:tag:genre:place:restaurant",
    )!;
    expect(eat.params["signal.interests.tags"]).toContain("urn:tag:dietary_option:qloo:vegetarian");
  });

  it("refuses a second run while one is in progress", async () => {
    const { store, run } = setup(guideContext(), { busy: true });
    await expect(run()).rejects.toBeInstanceOf(GuideBusyError);
    expect(store.saved).toBeNull();
  });

  it("marks the guide failed and streams an error when Qloo is down", async () => {
    const down: QlooClient = {
      mode: "live",
      get: async () => {
        throw new QlooError("http", "Qloo returned 503", 503);
      },
    };
    const { store, events, run } = setup(guideContext(), { qloo: down });
    await expect(run()).rejects.toThrow(/Qloo place calls failed/);
    expect(store.failed).toMatch(/503/);
    expect(store.saved).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });
});

describe("assignPlaces", () => {
  const entity = (id: string) => ({ entityId: id }) as QlooEntity;
  const list = (...ids: string[]): Candidate[] =>
    ids.map((id, rank) => ({ entity: entity(id), rank }));

  it("keeps a place in the section where it ranks best", () => {
    const result = assignPlaces({
      do: list("museum", "park", "market", "gallery", "venue", "shop", "garden"),
      rainy: list("gallery", "museum", "cinema", "spa"),
    });
    expect(result.rainy.map((c) => c.entity.entityId)).toEqual(["gallery", "cinema", "spa"]);
    expect(result.do.map((c) => c.entity.entityId)).toEqual([
      "museum",
      "park",
      "market",
      "venue",
      "shop",
      "garden",
    ]);
  });

  it("gives ties to the scarcer section and skips reserved IDs", () => {
    const result = assignPlaces(
      { eat: list("a", "b"), drink: list("a", "c"), rainy: list("r") },
      new Set(["b"]),
    );
    expect(result.drink.map((c) => c.entity.entityId)).toEqual(["a", "c"]);
    expect(result.eat).toEqual([]);
  });

  it("tops up an existing assignment without repeating places", () => {
    const first = assignPlaces({ eat: list("a", "b") });
    const second = assignPlaces({ eat: list("b", "c", "d") }, new Set(), first);
    expect(second.eat.map((c) => c.entity.entityId)).toEqual(["a", "b", "c", "d"]);
  });
});

function collectIds(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) value.forEach((v) => collectIds(v, into));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.entity_id === "string") into.add(record.entity_id);
    Object.values(record).forEach((v) => collectIds(v, into));
  }
}
