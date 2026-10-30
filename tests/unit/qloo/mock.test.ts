import { describe, expect, it } from "vitest";

import artists from "@/tests/fixtures/qloo/artists.json";
import movies from "@/tests/fixtures/qloo/movies.json";
import places from "@/tests/fixtures/qloo/places.json";
import tvShows from "@/tests/fixtures/qloo/tv_shows.json";

import { createQlooClient } from "@/lib/qloo/client";
import {
  audienceDemographics,
  findPlaceNearby,
  rankHostPicks,
  recommendMedia,
  searchArtists,
  searchMedia,
  searchPlaces,
  searchTags,
  sectionPlaces,
  tasteHeatmap,
} from "@/lib/qloo/endpoints";
import { QlooError } from "@/lib/qloo/errors";
import { createMemoryQlooStore } from "@/lib/qloo/store";
import { SECTION_TAGS, TAG_MAP, isKnownTagUrn } from "@/lib/qloo/tags";

const near = { lat: 41.0082, lng: 28.9784 }; // any point works: fixtures are placed by offset
const options = () => ({
  client: createQlooClient({
    mode: "mock",
    baseUrl: "https://qloo.test",
    store: createMemoryQlooStore(),
  }),
});
const signals = { entityIds: ["FIX-A-001", "FIX-M-002"], ageBand: "30_to_34" as const };

describe("fixtures", () => {
  it("are synthetic: FIX- IDs only, and place tags are confirmed URNs", () => {
    for (const item of [...places, ...artists, ...movies, ...tvShows])
      expect(item.id).toMatch(/^FIX-/);
    for (const place of places) for (const tag of place.tags) expect(isKnownTagUrn(tag)).toBe(true);
  });

  it("tag map entries are unique and well formed", () => {
    const labels = TAG_MAP.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const entry of TAG_MAP) {
      expect(entry.urns.length).toBeGreaterThan(0);
      for (const urn of entry.urns) expect(urn).toMatch(/^urn:tag:[a-z_]+(:[A-Za-z0-9_.-]+)+$/);
    }
  });
});

describe("endpoints in mock mode", () => {
  it("Q1/Q2/Q4: type-ahead and place search", async () => {
    expect((await searchArtists("velvet", options())).items.map((e) => e.entityId)).toEqual([
      "FIX-A-002",
    ]);
    const media = (await searchMedia("night", options())).items;
    expect(media.map((e) => e.types[0])).toContain("urn:entity:tv_show");
    const found = await searchPlaces({ query: "lantern", near, radiusM: 1000 }, options());
    expect(found.items[0]).toMatchObject({ entityId: "FIX-P-001", name: "Lantern & Ladle" });
    expect(found.items[0].location!.lat).toBeCloseTo(near.lat, 2);
    expect(found.params).toMatchObject({
      "filter.location": "41.0082,28.9784",
      "filter.radius": 1,
    });
  });

  it("Q3: tag lookup", async () => {
    const tags = (await searchTags("wine", options())).items.map((tag) => tag.id);
    expect(tags).toContain("urn:tag:genre:place:restaurant:wine_bar");
  });

  it("Q5: section places stay inside the radius, match the tags and are ranked", async () => {
    const result = await sectionPlaces(
      { near, radiusM: 2000, filterTags: SECTION_TAGS.drink, signals },
      options(),
    );
    const items = result.items;
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const item of items) {
      expect(item.entityId).toMatch(/^FIX-P-/);
      expect(item.distanceM).toBeLessThanOrEqual(2000);
      expect(
        item.tags.some((tag) => (SECTION_TAGS.drink as readonly string[]).includes(tag.id)),
      ).toBe(true);
      expect(item.explainability.map((e) => e.entityId).sort()).toEqual(["FIX-A-001", "FIX-M-002"]);
    }
    const affinities = items.map((item) => item.affinity!);
    expect(affinities).toEqual([...affinities].sort((a, b) => b - a));
    expect(result.params["filter.location"]).toBe("POINT(28.9784 41.0082)");
  });

  it("Q5: family drink has no bars, and a wider radius finds more", async () => {
    const family = await sectionPlaces(
      { near, radiusM: 2000, filterTags: SECTION_TAGS.drink_family },
      options(),
    );
    expect(family.items.length).toBeGreaterThanOrEqual(3);
    for (const item of family.items) {
      expect(item.tags.map((tag) => tag.id).join(" ")).not.toMatch(
        /:(bar|wine_bar|cocktail_bar)\b/,
      );
    }
    const narrow = await sectionPlaces(
      { near, radiusM: 2000, filterTags: SECTION_TAGS.eat },
      options(),
    );
    const wide = await sectionPlaces(
      { near, radiusM: 4000, filterTags: SECTION_TAGS.eat },
      options(),
    );
    expect(wide.items.length).toBeGreaterThan(narrow.items.length);
  });

  it("Q5: refuses unconfirmed filter tags (Qloo would silently return nothing)", () => {
    expect(() =>
      sectionPlaces({ near, radiusM: 2000, filterTags: ["urn:tag:genre:place:cinema"] }, options()),
    ).toThrow(QlooError);
  });

  it("different signals give a different order", async () => {
    const a = await sectionPlaces(
      { near, radiusM: 3000, filterTags: SECTION_TAGS.eat, signals },
      options(),
    );
    const b = await sectionPlaces(
      {
        near,
        radiusM: 3000,
        filterTags: SECTION_TAGS.eat,
        signals: { entityIds: ["FIX-A-006", "FIX-M-005"] },
      },
      options(),
    );
    expect(a.items.map((i) => i.entityId)).not.toEqual(b.items.map((i) => i.entityId));
  });

  it("Q6/Q7: media recommendations exclude the guest's own picks", async () => {
    const playlist = await recommendMedia("artist", signals, options());
    expect(playlist.items.length).toBeGreaterThan(5);
    expect(playlist.items.map((e) => e.entityId)).not.toContain("FIX-A-001");
    expect(playlist.params["filter.location"]).toBeUndefined();
    const films = await recommendMedia("movie", signals, options());
    expect(films.items).toHaveLength(10);
    expect(films.items.map((e) => e.entityId)).not.toContain("FIX-M-002");
    expect((await recommendMedia("tv_show", signals, options())).items).toHaveLength(6);
  });

  it("Q8: ranks only the host's own picks", async () => {
    const picks = ["FIX-P-009", "FIX-P-030", "FIX-P-001"];
    const ranked = await rankHostPicks(picks, signals, options());
    expect(ranked.items.map((e) => e.entityId).sort()).toEqual([...picks].sort());
    expect((await rankHostPicks([], signals, options())).items).toEqual([]);
  });

  it("Q9: heatmap cells are normalised within the area", async () => {
    const cells = (await tasteHeatmap({ near, signals }, options())).items;
    expect(cells.length).toBeGreaterThan(100);
    expect(Math.max(...cells.map((cell) => cell.affinity))).toBe(1);
    for (const cell of cells) {
      expect(cell.lat).toBeCloseTo(near.lat, 1);
      expect(cell.lng).toBeCloseTo(near.lng, 1);
    }
  });

  it("Q10: finds a named place nearby, or null", async () => {
    expect((await findPlaceNearby("Copper Finch", near, options())).items?.entityId).toBe(
      "FIX-P-011",
    );
    expect(
      (await findPlaceNearby("Restaurant That Does Not Exist", near, options())).items,
    ).toBeNull();
  });

  it("Q11: averages demographics across the guest's picks", async () => {
    const audience = (await audienceDemographics(signals.entityIds, options())).items;
    expect(audience.rows).toHaveLength(2);
    expect(Object.keys(audience.age)).toHaveLength(6);
    expect(audience.topAgeBand).toMatch(/_/);
  });
});
