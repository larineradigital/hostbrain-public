import "server-only";

import type { z } from "zod";

import { getQlooClient, type QlooCallContext, type QlooClient } from "./client";
import { QlooError } from "./errors";
import type { AgeBand, QlooParams, QlooPath } from "./guard";
import {
  demographicsResponseSchema,
  heatmapResponseSchema,
  insightsResponseSchema,
  searchResponseSchema,
  tagsResponseSchema,
  type QlooDemographicsRow,
  type QlooEntity,
  type QlooHeatmapCell,
  type QlooTagResult,
} from "./schemas";
import { isKnownTagUrn } from "./tags";

/**
 * Typed Qloo calls, labelled Q1–Q11 below, using the formats confirmed against the live
 * API. Each returns the parsed items plus the params sent, so callers
 * can store the request (never the key) next to the results.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** What we know about the guest's taste. Never names, emails or booking data. */
export interface TasteSignals {
  entityIds?: readonly string[];
  tagUrns?: readonly string[];
  ageBand?: AgeBand;
}

export interface QlooCallResult<T> {
  items: T;
  cacheHit: boolean;
  /** Params as sent (before normalisation), for `qloo_request` columns. */
  params: QlooParams;
}

export interface EndpointOptions extends QlooCallContext {
  client?: QlooClient;
}

export type MediaType = "artist" | "movie" | "tv_show";

const MAX_SIGNAL_ENTITIES = 25;
const METRES_PER_MILE = 1609.344;

/** Insights: WKT, longitude first. Rounded to 4 decimals (about 11 m) so caches are shared. */
export const wktPoint = ({ lat, lng }: LatLng) => `POINT(${round4(lng)} ${round4(lat)})`;
/** Search: `lat,lon`. */
export const latLonParam = ({ lat, lng }: LatLng) => `${round4(lat)},${round4(lng)}`;
const round4 = (value: number) => Number(value.toFixed(4));

/** `/search` takes `filter.radius` in (probably) miles, 1…100. */
export const searchRadius = (radiusM: number) =>
  Math.min(100, Math.max(1, Math.ceil(radiusM / METRES_PER_MILE)));

const list = (values: readonly string[] | undefined, max = 50) =>
  values && values.length > 0 ? [...new Set(values)].slice(0, max) : undefined;

const signalParams = (signals: TasteSignals = {}): QlooParams => ({
  "signal.interests.entities": list(signals.entityIds, MAX_SIGNAL_ENTITIES),
  "signal.interests.tags": list(signals.tagUrns, 20),
  "signal.demographics.age": signals.ageBand,
});

async function call<S extends z.ZodType>(
  path: QlooPath,
  params: QlooParams,
  schema: S,
  { client = getQlooClient(), ...context }: EndpointOptions,
): Promise<QlooCallResult<z.output<S>>> {
  const result = await client.get(path, params, context);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    throw new QlooError(
      "schema",
      `Unexpected Qloo ${path} response: ${parsed.error.issues[0]?.message}`,
    );
  }
  return { items: parsed.data, cacheHit: result.cacheHit, params };
}

/** Filter tags must come from our confirmed map: Qloo answers unknown tags with 200 and nothing. */
function assertKnownTags(urns: readonly string[]) {
  const unknown = urns.filter((urn) => !isKnownTagUrn(urn));
  if (unknown.length)
    throw new QlooError("config", `Unconfirmed Qloo tag URNs: ${unknown.join(", ")}`);
}

const ENTITY_TYPE: Record<MediaType, string> = {
  artist: "urn:entity:artist",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
};

/** Q1: quiz type-ahead for artists. */
export const searchArtists = (query: string, options: EndpointOptions & { take?: number } = {}) =>
  call<typeof searchResponseSchema>(
    "/search",
    { query, types: [ENTITY_TYPE.artist], take: options.take ?? 5 },
    searchResponseSchema,
    options,
  );

/** Q2: quiz type-ahead for films and shows. */
export const searchMedia = (query: string, options: EndpointOptions & { take?: number } = {}) =>
  call<typeof searchResponseSchema>(
    "/search",
    { query, types: [ENTITY_TYPE.movie, ENTITY_TYPE.tv_show], take: options.take ?? 5 },
    searchResponseSchema,
    options,
  );

/** Q3: tag lookup for chips and the concierge's `search_tags`. */
export const searchTags = (
  word: string,
  options: EndpointOptions & { take?: number } = {},
): Promise<QlooCallResult<QlooTagResult[]>> =>
  call("/v2/tags", { "filter.query": word, take: options.take ?? 8 }, tagsResponseSchema, options);

export interface PlaceSearch {
  query: string;
  near: LatLng;
  radiusM?: number;
  take?: number;
}

/** Q4 (host picks search) and Q10 (AI-alone check): places by name near the property. */
export const searchPlaces = (
  { query, near, radiusM = 3000, take = 8 }: PlaceSearch,
  options: EndpointOptions = {},
): Promise<QlooCallResult<QlooEntity[]>> =>
  call(
    "/search",
    {
      query,
      types: ["urn:entity:place"],
      "filter.location": latLonParam(near),
      "filter.radius": searchRadius(radiusM),
      take,
    },
    searchResponseSchema,
    options,
  );

/**
 * Q10: the best match for a place name near the property, or null. `accept` picks the
 * first of the top 3 that really is the named place (search is fuzzy); default: the first.
 */
export async function findPlaceNearby(
  name: string,
  near: LatLng,
  options: EndpointOptions & { radiusM?: number; accept?: (entity: QlooEntity) => boolean } = {},
) {
  const result = await searchPlaces(
    { query: name, near, radiusM: options.radiusM ?? 2000, take: 3 },
    options,
  );
  const accept = options.accept ?? (() => true);
  return { ...result, items: result.items.find(accept) ?? null };
}

export interface SectionQuery {
  near: LatLng;
  radiusM: number;
  /** Confirmed URNs from `SECTION_TAGS` or the chip map; matches any. */
  filterTags: readonly string[];
  signals?: TasteSignals;
  priceLevel?: { min?: number; max?: number };
  excludeEntityIds?: readonly string[];
  take?: number;
}

/** Q5: places for a guide section, ranked by the guest's taste, with explainability. */
export function sectionPlaces(query: SectionQuery, options: EndpointOptions = {}) {
  assertKnownTags(query.filterTags);
  return call<typeof insightsResponseSchema>(
    "/v2/insights",
    {
      "filter.type": "urn:entity:place",
      "filter.location": wktPoint(query.near),
      "filter.location.radius": Math.round(query.radiusM),
      "filter.tags": list(query.filterTags),
      "filter.exclude.entities": list(query.excludeEntityIds),
      "filter.price_level.min": query.priceLevel?.min,
      "filter.price_level.max": query.priceLevel?.max,
      ...signalParams(query.signals),
      "feature.explainability": true,
      take: query.take ?? 20,
    },
    insightsResponseSchema,
    options,
  );
}

/**
 * Q6 and Q7: artists, movies or shows for the guest's taste. No location signal:
 * it reshuffles results towards the city, and the playlist and
 * film shelf should be about the guest.
 */
export const recommendMedia = (
  type: MediaType,
  signals: TasteSignals,
  options: EndpointOptions & { take?: number } = {},
) =>
  call<typeof insightsResponseSchema>(
    "/v2/insights",
    {
      "filter.type": ENTITY_TYPE[type],
      ...signalParams(signals),
      "feature.explainability": true,
      take: options.take ?? { artist: 25, movie: 10, tv_show: 6 }[type],
    },
    insightsResponseSchema,
    options,
  );

/**
 * Q8: the host's own picks, ranked by affinity to this guest. No age signal: with entity,
 * tag and age signals together the call hung past 25 s for guide D's profile, while any two
 * of the three answered in under a second (live, Oct 22).
 */
export async function rankHostPicks(
  hostPickIds: readonly string[],
  signals: TasteSignals,
  options: EndpointOptions = {},
): Promise<QlooCallResult<QlooEntity[]>> {
  const ids = list(hostPickIds);
  if (!ids) return { items: [], cacheHit: false, params: {} };
  return call(
    "/v2/insights",
    {
      "filter.type": "urn:entity:place",
      "filter.results.entities": ids,
      ...signalParams({ entityIds: signals.entityIds, tagUrns: signals.tagUrns }),
      "feature.explainability": true,
      take: ids.length,
    },
    insightsResponseSchema,
    options,
  );
}

/** Q9: taste heatmap around the property. Affinity is normalised within this area only. */
export const tasteHeatmap = (
  { near, radiusM = 3000, signals }: { near: LatLng; radiusM?: number; signals: TasteSignals },
  options: EndpointOptions = {},
): Promise<QlooCallResult<QlooHeatmapCell[]>> =>
  call(
    "/v2/insights",
    {
      "filter.type": "urn:heatmap",
      "filter.location": wktPoint(near),
      "filter.location.radius": Math.round(radiusM),
      ...signalParams({ entityIds: signals.entityIds, tagUrns: signals.tagUrns }),
    },
    heatmapResponseSchema,
    options,
  );

export interface AudienceSummary {
  rows: QlooDemographicsRow[];
  /** Mean score per age band across the input entities. */
  age: Record<string, number>;
  topAgeBand: string | null;
}

/** Q11: audience flavour. Qloo returns one row per input entity; we average them. */
export async function audienceDemographics(
  entityIds: readonly string[],
  options: EndpointOptions = {},
): Promise<QlooCallResult<AudienceSummary>> {
  const ids = list(entityIds, MAX_SIGNAL_ENTITIES);
  if (!ids) return { items: { rows: [], age: {}, topAgeBand: null }, cacheHit: false, params: {} };
  const result = await call(
    "/v2/insights",
    { "filter.type": "urn:demographics", "signal.interests.entities": ids },
    demographicsResponseSchema,
    options,
  );
  const totals = new Map<string, number[]>();
  for (const row of result.items) {
    for (const [band, score] of Object.entries(row.age))
      totals.set(band, [...(totals.get(band) ?? []), score]);
  }
  const age = Object.fromEntries(
    [...totals].map(([band, scores]) => [band, scores.reduce((a, b) => a + b, 0) / scores.length]),
  );
  // Scores are relative to the overall audience: only a band above zero is a real skew.
  const top = Object.entries(age).sort((a, b) => b[1] - a[1])[0];
  const topAgeBand = top && top[1] > 0 ? top[0] : null;
  return { ...result, items: { rows: result.items, age, topAgeBand } };
}
