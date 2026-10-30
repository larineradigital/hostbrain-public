import "server-only";

import { z } from "zod";

/**
 * Tolerant parsers for Qloo responses (field names confirmed against the live API).
 *
 * - Unknown fields never fail a parse; the raw response stays in `qloo_cache` only.
 * - Missing or malformed optional fields become `undefined` instead of throwing.
 * - A single malformed item is dropped, not the whole list.
 * - Search tags use `tag_id`, insights tags use `id`; both normalise to `id`.
 * - Places use `lat`/`lon`, heatmap cells use `latitude`/`longitude`; both normalise to `lat`/`lon`.
 */

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
const optNumber = optional(z.number().finite());
const optString = optional(z.string());
const optBoolean = optional(z.boolean());
const optStrings = optional(z.array(z.string()));

/** An array whose invalid items are skipped instead of failing the whole response. */
export const tolerantArray = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((value) => {
        const parsed = item.safeParse(value);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      }),
    );

export const tagSchema = z
  .looseObject({
    id: optString,
    tag_id: optString,
    name: optString,
    type: optString,
    weight: optNumber,
    value: optString,
  })
  .transform((tag) => ({
    id: tag.id ?? tag.tag_id ?? "",
    name: tag.name ?? tag.value ?? "",
    type: tag.type,
    weight: tag.weight,
  }))
  .refine((tag) => tag.id.startsWith("urn:tag:"), "tag without a URN");
export type QlooTag = z.output<typeof tagSchema>;

const coordinate = (min: number, max: number) => z.number().finite().min(min).max(max);

export const locationSchema = z
  .looseObject({
    lat: optional(coordinate(-90, 90)),
    lon: optional(coordinate(-180, 180)),
    latitude: optional(coordinate(-90, 90)),
    longitude: optional(coordinate(-180, 180)),
    geohash: optString,
  })
  .transform((loc) => ({
    lat: loc.lat ?? loc.latitude,
    lon: loc.lon ?? loc.longitude,
    geohash: loc.geohash,
  }))
  .refine((loc) => loc.lat !== undefined && loc.lon !== undefined, "location without coordinates")
  .transform((loc) => ({ lat: loc.lat!, lon: loc.lon!, geohash: loc.geohash }));
export type QlooLocation = z.output<typeof locationSchema>;

/** The fields we read downstream. Everything else Qloo sends is kept as-is. */
export const propertiesSchema = z
  .looseObject({
    address: optString,
    neighborhood: optString,
    phone: optString,
    website: optString,
    image: optional(z.looseObject({ url: optString })),
    price_level: optional(z.number().int().min(1).max(4).nullable()),
    business_rating: optNumber,
    is_closed: optBoolean,
    keywords: optional(z.array(z.unknown())),
    short_description: optString,
    description: optString,
    release_year: optional(z.union([z.number(), z.string()])),
    content_rating: optString,
    short_descriptions: optional(z.array(z.unknown())),
    primary_genres: optional(z.array(z.unknown())),
  })
  .catch({});
export type QlooProperties = z.output<typeof propertiesSchema>;

const explainSchema = z
  .looseObject({ entity_id: z.string(), score: optNumber })
  .transform((item) => ({ entityId: item.entity_id, score: item.score ?? 0 }));

const entityQuerySchema = z
  .looseObject({
    affinity: optNumber,
    distance: optNumber,
    explainability: optional(
      z.looseObject({ "signal.interests.entities": tolerantArray(explainSchema) }),
    ),
  })
  .catch({});

export const entitySchema = z
  .looseObject({
    entity_id: z.string().min(1),
    name: z.string().min(1),
    type: optString,
    types: optStrings,
    subtype: optString,
    popularity: optNumber,
    disambiguation: optString,
    location: optional(locationSchema),
    properties: optional(propertiesSchema),
    tags: tolerantArray(tagSchema),
    query: optional(entityQuerySchema),
  })
  .transform((entity) => ({
    entityId: entity.entity_id,
    name: entity.name,
    types: entity.types ?? (entity.type ? [entity.type] : []),
    subtype: entity.subtype,
    popularity: entity.popularity,
    disambiguation: entity.disambiguation,
    location: entity.location,
    properties: entity.properties ?? {},
    tags: entity.tags,
    affinity: entity.query?.affinity,
    distanceM: entity.query?.distance,
    explainability: entity.query?.explainability?.["signal.interests.entities"] ?? [],
  }));
export type QlooEntity = z.output<typeof entitySchema>;

/** `/search`: `{ results: [...] }`. */
export const searchResponseSchema = z
  .looseObject({ results: tolerantArray(entitySchema) })
  .transform((body) => body.results);

/** `/v2/tags`: `{ results: { tags: [...] } }`. */
export const tagsResponseSchema = z
  .looseObject({
    results: z.looseObject({
      tags: tolerantArray(
        z
          .looseObject({
            id: z.string().startsWith("urn:tag:"),
            name: optString,
            type: optString,
            popularity: optNumber,
            parents: optional(z.array(z.unknown())),
          })
          .transform((tag) => ({
            id: tag.id,
            name: tag.name ?? tag.id,
            type: tag.type,
            popularity: tag.popularity,
          })),
      ),
    }),
  })
  .transform((body) => body.results.tags);
export type QlooTagResult = z.output<typeof tagsResponseSchema>[number];

/** `/v2/insights` for entity types: `{ success, results: { entities: [...] } }`. */
export const insightsResponseSchema = z
  .looseObject({ results: z.looseObject({ entities: tolerantArray(entitySchema) }) })
  .transform((body) => body.results.entities);

export const heatmapCellSchema = z
  .looseObject({
    location: locationSchema,
    query: z
      .looseObject({ affinity: optNumber, affinity_rank: optNumber, popularity: optNumber })
      .catch({}),
  })
  .transform((cell) => ({
    lat: cell.location.lat,
    lng: cell.location.lon,
    geohash: cell.location.geohash,
    affinity: cell.query.affinity ?? 0,
    affinityRank: cell.query.affinity_rank,
    popularity: cell.query.popularity,
  }));
export type QlooHeatmapCell = z.output<typeof heatmapCellSchema>;

/** `/v2/insights?filter.type=urn:heatmap`: `{ results: { heatmap: [...] } }`. */
export const heatmapResponseSchema = z
  .looseObject({ results: z.looseObject({ heatmap: tolerantArray(heatmapCellSchema) }) })
  .transform((body) => body.results.heatmap);

const scoreRecord = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((scores) =>
    Object.fromEntries(
      Object.entries(scores).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    ),
  );

/** `/v2/insights?filter.type=urn:demographics`: one row per input entity. */
export const demographicsResponseSchema = z
  .looseObject({
    results: z.looseObject({
      demographics: tolerantArray(
        z
          .looseObject({
            entity_id: optString,
            query: z
              .looseObject({ age: scoreRecord, gender: scoreRecord })
              .catch({ age: {}, gender: {} }),
          })
          .transform((row) => ({
            entityId: row.entity_id,
            age: row.query.age,
            gender: row.query.gender,
          })),
      ),
    }),
  })
  .transform((body) => body.results.demographics);
export type QlooDemographicsRow = z.output<typeof demographicsResponseSchema>[number];

/** Removes every `akas` key (verbose, never used) before a response is cached. */
export function stripAkas<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripAkas) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "akas")
        .map(([key, inner]) => [key, stripAkas(inner)]),
    ) as T;
  }
  return value;
}
