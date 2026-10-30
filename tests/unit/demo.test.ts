import { describe, expect, it } from "vitest";

import { DEMO_GUESTS, DEMO_PAIR, DEMO_PROPERTIES } from "@/lib/demo/personas";
import {
  assertSeedTarget,
  decideTry,
  demoStayDates,
  isLocalSupabaseUrl,
  pickSearchMatch,
  placeOverlap,
  previewSections,
  searchKey,
} from "@/lib/demo/rules";
import { HOST_AGE_BANDS } from "@/lib/guide/new-guide";
import type { GuideItem, SectionKind } from "@/lib/guide/types";
import { TAG_MAP } from "@/lib/qloo/tags";

const item = (id: string, name = id): GuideItem => ({
  entity_id: id,
  name,
  category: "Cafe",
  address: null,
  lat: null,
  lng: null,
  distance_m: null,
  image_url: null,
  price_level: null,
  why_you: "",
  signals_used: [],
  affinity: null,
  explain: [],
  tags: [],
});

const section = (kind: SectionKind, ids: string[]) => ({
  section: kind,
  items: ids.map((id) => item(id)),
});

describe("demo personas", () => {
  it("only use chip labels that exist in the tag map", () => {
    const chips = new Set(
      TAG_MAP.filter((e) => e.kind === "cuisine" || e.kind === "vibe").map((e) => e.label),
    );
    const dietary = new Set(TAG_MAP.filter((e) => e.kind === "dietary").map((e) => e.label));
    for (const guest of DEMO_GUESTS) {
      for (const label of guest.tagLabels) expect(chips, `${guest.key}: ${label}`).toContain(label);
      for (const label of guest.dietary) expect(dietary, `${guest.key}: ${label}`).toContain(label);
    }
  });

  it("use the quiz's age bands and real properties", () => {
    const bands = new Set<string>(HOST_AGE_BANDS.map((b) => b.value));
    const keys = new Set(DEMO_PROPERTIES.map((p) => p.key));
    for (const guest of DEMO_GUESTS) {
      if (guest.ageBand) expect(bands).toContain(guest.ageBand);
      expect(keys).toContain(guest.property);
      expect(guest.artists.length).toBeLessThanOrEqual(5);
      expect(guest.media.length).toBeLessThanOrEqual(5);
    }
  });

  it("put the headline pair on the same flat, and the skip path has no taste", () => {
    const [a, b] = DEMO_PAIR.map((key) => DEMO_GUESTS.find((g) => g.key === key)!);
    expect(a.property).toBe(b.property);
    const skipped = DEMO_GUESTS.filter((g) => g.skipped);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      artists: [],
      media: [],
      tagLabels: [],
      source: "self_serve",
    });
    expect(DEMO_PROPERTIES.find((p) => p.key === skipped[0].property)?.selfServe).toBe(true);
  });

  it("have at most 10 host picks per property, with short notes", () => {
    for (const property of DEMO_PROPERTIES) {
      expect(property.picks.length).toBeLessThanOrEqual(10);
      for (const pick of property.picks) expect(pick.note.length).toBeLessThanOrEqual(280);
    }
  });
});

describe("seed target", () => {
  it("knows local Supabase URLs", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("https://abc.supabase.co")).toBe(false);
    expect(isLocalSupabaseUrl("https://127.0.0.1.evil.example")).toBe(false);
    expect(isLocalSupabaseUrl("not a url")).toBe(false);
    expect(isLocalSupabaseUrl(undefined)).toBe(false);
  });

  it("refuses a hosted project unless --env production", () => {
    expect(() => assertSeedTarget("https://abc.supabase.co", "local")).toThrow(/--env production/);
    expect(() => assertSeedTarget("https://abc.supabase.co", "production")).not.toThrow();
    expect(() => assertSeedTarget("http://127.0.0.1:54321", "local")).not.toThrow();
    expect(() => assertSeedTarget(undefined, "production")).toThrow();
  });
});

describe("pickSearchMatch", () => {
  const results = [
    { name: "Peggy Lee", types: ["urn:entity:artist"] },
    { name: "Peggy Gou", types: ["urn:entity:artist"] },
    { name: "The Bear", types: ["urn:entity:movie"] },
    { name: "The Bear", types: ["urn:entity:tv_show"] },
  ];

  it("prefers an exact name of the wanted type over fuzzy first hits", () => {
    expect(pickSearchMatch(results, "Peggy Gou")?.name).toBe("Peggy Gou");
    expect(pickSearchMatch(results, "the bear", "urn:entity:tv_show")?.types).toEqual([
      "urn:entity:tv_show",
    ]);
  });

  it("falls back to the first result of the wanted type, else null", () => {
    expect(pickSearchMatch(results, "Pegy Goo", "urn:entity:artist")?.name).toBe("Peggy Lee");
    expect(pickSearchMatch([], "anything")).toBeNull();
    expect(pickSearchMatch(results, "x", "urn:entity:podcast")).toBeNull();
  });

  it("ignores punctuation and accents", () => {
    expect(searchKey("Fred again..")).toBe(searchKey("Fred Again"));
    expect(searchKey("Sigur Rós")).toBe("sigurros");
  });
});

describe("decideTry", () => {
  it("creates a guide when live and within limits", () => {
    expect(decideTry({ qlooMode: "live", quotaAllowed: true, ipAllowed: true })).toEqual({
      kind: "create",
    });
    expect(decideTry({ qlooMode: "mock", quotaAllowed: true, ipAllowed: true }).kind).toBe(
      "create",
    );
  });

  it("opens a ready guide in replay mode, whatever the limits", () => {
    expect(decideTry({ qlooMode: "replay", quotaAllowed: true, ipAllowed: true })).toEqual({
      kind: "fallback",
      reason: "paused",
    });
  });

  it("opens a ready guide when the demo or the IP is over its limit", () => {
    expect(decideTry({ qlooMode: "live", quotaAllowed: false, ipAllowed: true })).toEqual({
      kind: "fallback",
      reason: "busy",
    });
    expect(decideTry({ qlooMode: "live", quotaAllowed: true, ipAllowed: false }).kind).toBe(
      "fallback",
    );
  });
});

describe("demoStayDates", () => {
  it("starts today and spans the nights asked", () => {
    expect(demoStayDates(new Date("2026-10-30T22:00:00Z"))).toEqual({
      checkIn: "2026-10-30",
      checkOut: "2026-11-03",
    });
    expect(demoStayDates(new Date("2026-10-21T00:00:00Z"), 1).checkOut).toBe("2026-10-22");
  });
});

describe("previews", () => {
  it("keeps the compared sections in order, three items each, and drops empty ones", () => {
    const preview = previewSections([
      section("films", ["f1"]),
      section("eat", ["e1", "e2", "e3", "e4"]),
      section("drink", []),
      section("rainy", ["r1"]),
      section("playlist", ["p1", "p2"]),
    ]);
    expect(preview.map((s) => s.section)).toEqual(["eat", "playlist", "films"]);
    expect(preview[0].items.map((i) => i.entity_id)).toEqual(["e1", "e2", "e3"]);
    expect(Object.keys(preview[0].items[0]).sort()).toEqual(["category", "entity_id", "name"]);
  });

  it("counts shared places across place sections only", () => {
    const a = [section("eat", ["x", "a1"]), section("do", ["y"]), section("playlist", ["m"])];
    const b = [section("drink", ["x"]), section("rainy", ["b1", "y"]), section("playlist", ["m"])];
    expect(placeOverlap(a, b)).toEqual({ shared: 2, left: 3, right: 3 });
    expect(placeOverlap(a, []).shared).toBe(0);
  });
});
