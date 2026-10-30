import { describe, expect, it } from "vitest";

import {
  demographicsResponseSchema,
  entitySchema,
  heatmapResponseSchema,
  insightsResponseSchema,
  searchResponseSchema,
  stripAkas,
  tagsResponseSchema,
} from "@/lib/qloo/schemas";

// Synthetic shapes only (fictional names, FIX- IDs); field names as the live API sends them.

describe("schemas tolerate the live shapes", () => {
  it("normalises search tags (tag_id) and insights tags (id) to the same shape", () => {
    const fromSearch = searchResponseSchema.parse({
      results: [
        {
          entity_id: "FIX-S-1",
          name: "Fixture Bar",
          types: ["urn:entity:place"],
          tags: [
            {
              tag_id: "urn:tag:genre:place:restaurant:bar",
              name: "Bar",
              type: "urn:tag:genre:place",
              value: "x",
            },
          ],
          location: { lat: 38.71, lon: -9.14 },
        },
      ],
    });
    const fromInsights = insightsResponseSchema.parse({
      success: true,
      results: {
        entities: [
          {
            entity_id: "FIX-S-1",
            name: "Fixture Bar",
            type: "urn:entity:place",
            tags: [
              {
                id: "urn:tag:genre:place:restaurant:bar",
                name: "Bar",
                type: "urn:tag:genre:place",
                weight: 0.7,
              },
            ],
            query: { affinity: 0.84, distance: 312.5 },
          },
        ],
      },
    });
    expect(fromSearch[0].tags[0].id).toBe("urn:tag:genre:place:restaurant:bar");
    expect(fromInsights[0].tags[0].id).toBe("urn:tag:genre:place:restaurant:bar");
    expect(fromSearch[0].types).toEqual(["urn:entity:place"]);
    expect(fromInsights[0].types).toEqual(["urn:entity:place"]);
    expect(fromSearch[0].location).toEqual({ lat: 38.71, lon: -9.14, geohash: undefined });
    expect(fromInsights[0]).toMatchObject({ affinity: 0.84, distanceM: 312.5 });
  });

  it("keeps unknown fields and survives missing or malformed optional ones", () => {
    const entity = entitySchema.parse({
      entity_id: "FIX-E-1",
      name: "Fixture Café",
      brand_new_field: { anything: true },
      popularity: "very",
      tags: "not-a-list",
      location: { lat: "north" },
      properties: {
        price_level: null,
        business_rating: "4.5 stars",
        hours: { monday: ["09:00-17:00"] },
        image: { url: "https://example.test/x.jpg" },
        cuisine_description: "Fictional pastries.",
      },
      query: {
        affinity: 0.9,
        explainability: {
          "signal.interests.entities": [{ entity_id: "FIX-A-1", score: 0.6 }, { score: 1 }],
        },
      },
    });
    expect(entity.popularity).toBeUndefined();
    expect(entity.tags).toEqual([]);
    expect(entity.location).toBeUndefined();
    expect(entity.properties.price_level).toBeNull();
    expect(entity.properties.business_rating).toBeUndefined();
    expect(entity.properties.image?.url).toBe("https://example.test/x.jpg");
    expect((entity.properties as Record<string, unknown>).cuisine_description).toBe(
      "Fictional pastries.",
    );
    expect(entity.explainability).toEqual([{ entityId: "FIX-A-1", score: 0.6 }]);
  });

  it("drops a malformed entity instead of failing the list", () => {
    const items = insightsResponseSchema.parse({
      results: { entities: [{ name: "No ID" }, { entity_id: "FIX-OK", name: "Fine" }, null, 7] },
    });
    expect(items.map((item) => item.entityId)).toEqual(["FIX-OK"]);
  });

  it("treats a missing results list on /search as empty", () => {
    expect(searchResponseSchema.parse({})).toEqual([]);
  });

  it("reads heatmap cells with latitude/longitude", () => {
    const cells = heatmapResponseSchema.parse({
      success: true,
      results: {
        heatmap: [
          {
            location: { latitude: 38.7, longitude: -9.1, geohash: "fix0001" },
            query: {
              affinity: 0.4,
              affinity_rank: 3,
              popularity: 0.2,
              entity_artist_affinity: 0.1,
            },
          },
          { location: { latitude: 200, longitude: -9.1 }, query: {} },
          { location: { latitude: 38.71, longitude: -9.12 } },
        ],
      },
    });
    expect(cells).toEqual([
      { lat: 38.7, lng: -9.1, geohash: "fix0001", affinity: 0.4, affinityRank: 3, popularity: 0.2 },
      {
        lat: 38.71,
        lng: -9.12,
        geohash: undefined,
        affinity: 0,
        affinityRank: undefined,
        popularity: undefined,
      },
    ]);
  });

  it("reads tags and demographics", () => {
    expect(
      tagsResponseSchema.parse({
        results: {
          tags: [
            { id: "urn:tag:genre:place:market", name: "Market", extra: 1 },
            { id: "not-a-urn" },
          ],
        },
      }),
    ).toEqual([
      { id: "urn:tag:genre:place:market", name: "Market", type: undefined, popularity: undefined },
    ]);

    expect(
      demographicsResponseSchema.parse({
        results: {
          demographics: [
            {
              entity_id: "FIX-A-1",
              query: { age: { "25_to_29": 0.3, bad: "x" }, gender: { male: -0.1, female: 0.1 } },
            },
          ],
        },
      }),
    ).toEqual([
      { entityId: "FIX-A-1", age: { "25_to_29": 0.3 }, gender: { male: -0.1, female: 0.1 } },
    ]);
  });

  it("strips akas at any depth", () => {
    expect(stripAkas({ akas: [1], a: [{ akas: 2, b: { akas: 3, c: 4 } }] })).toEqual({
      a: [{ b: { c: 4 } }],
    });
  });
});
