import "server-only";

import artists from "@/tests/fixtures/qloo/artists.json";
import movies from "@/tests/fixtures/qloo/movies.json";
import places from "@/tests/fixtures/qloo/places.json";
import tvShows from "@/tests/fixtures/qloo/tv_shows.json";

import type { QlooPath } from "./guard";
import { TAG_MAP } from "./tags";

/**
 * Mock Qloo for `QLOO_MODE=mock`. Builds responses with the same
 * shape as the live API from synthetic fixtures (fictional names, `FIX-` IDs), so the
 * schemas, endpoints and UI run unchanged without a key. Results are deterministic:
 * the same signals always give the same order, and different signals give different orders.
 */

/** Used when a call has no location (the M0 test point). */
const DEFAULT_CENTER = { lat: 38.7139, lng: -9.1394 };
const METRES_PER_DEGREE = 111_320;
const METRES_PER_MILE = 1609.344;

type MediaFixture = (typeof movies)[number] | (typeof artists)[number];

/** FNV-1a hash → 0…1. */
function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));
const csv = (value: string | undefined) => (value ? value.split(",").filter(Boolean) : []);
const lastSegment = (urn: string) => urn.split(":").at(-1) ?? urn;
const titleCase = (slug: string) =>
  slug.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());

function parsePoint(value: string | undefined) {
  const match = value && /^POINT\((\S+) (\S+)\)$/.exec(value);
  return match ? { lat: Number(match[2]), lng: Number(match[1]) } : undefined;
}

function parseLatLon(value: string | undefined) {
  const [lat, lng] = (value ?? "").split(",").map(Number);
  return value ? { lat, lng } : undefined;
}

function placeAt(place: (typeof places)[number], center: { lat: number; lng: number }) {
  const lat = center.lat + place.dy / METRES_PER_DEGREE;
  const lng = center.lng + place.dx / (METRES_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180));
  return {
    lat: round(lat, 6),
    lon: round(lng, 6),
    distance: Math.round(Math.hypot(place.dx, place.dy)),
  };
}

function tagObjects(urns: readonly string[], field: "id" | "tag_id") {
  // Live places carry both the genre and the category family; mirror that.
  const all = urns.flatMap((urn) =>
    urn.startsWith("urn:tag:genre:place:")
      ? [urn, `urn:tag:category:place:${lastSegment(urn)}`]
      : [urn],
  );
  return all.map((urn) => ({
    [field]: urn,
    name: titleCase(lastSegment(urn)),
    type: urn.split(":").slice(0, -1).join(":"),
    ...(field === "id" ? { weight: round(0.5 + hash01(urn) / 2, 3) } : { value: urn }),
  }));
}

function placeEntity(
  place: (typeof places)[number],
  center: { lat: number; lng: number },
  shape: "search" | "insights",
) {
  const { lat, lon, distance } = placeAt(place, center);
  const properties = {
    address: `${place.address}, ${place.neighborhood}`,
    neighborhood: place.neighborhood,
    price_level: place.price_level,
    business_rating: place.rating,
    keywords: place.keywords.map((name) => ({ name, count: Math.round(hash01(name) * 200) })),
    short_description: place.short_description,
    image: { url: `https://placehold.co/600x400?text=${encodeURIComponent(place.name)}` },
    is_closed: false,
  };
  const base = {
    entity_id: place.id,
    name: place.name,
    popularity: place.popularity,
    disambiguation: place.neighborhood,
    location: { lat, lon },
    properties,
  };
  const entity =
    shape === "search"
      ? { ...base, types: ["urn:entity:place"], tags: tagObjects(place.tags, "tag_id") }
      : {
          ...base,
          type: "urn:entity:place",
          subtype: "urn:entity:place",
          tags: tagObjects(place.tags, "id"),
        };
  return { entity, distance };
}

function mediaEntity(item: MediaFixture, type: string, shape: "search" | "insights") {
  const properties =
    "release_year" in item
      ? {
          release_year: item.release_year,
          content_rating: item.content_rating,
          short_descriptions: [{ value: item.short_description, languages: ["en"] }],
          image: { url: `https://placehold.co/400x600?text=${encodeURIComponent(item.name)}` },
        }
      : {
          short_descriptions: [{ value: item.short_description, languages: ["en"] }],
          image: { url: `https://placehold.co/400x400?text=${encodeURIComponent(item.name)}` },
        };
  const tags = item.genres.map((genre) => `urn:tag:genre:qloo:${genre.replace(/[^a-z]+/gi, "_")}`);
  const base = {
    entity_id: item.id,
    name: item.name,
    popularity: item.popularity,
    disambiguation: item.genres.join(", "),
    properties,
  };
  return shape === "search"
    ? { ...base, types: [type], tags: tagObjects(tags, "tag_id") }
    : { ...base, type, subtype: type, tags: tagObjects(tags, "id") };
}

const MEDIA: Record<string, readonly MediaFixture[]> = {
  "urn:entity:artist": artists,
  "urn:entity:movie": movies,
  "urn:entity:tv_show": tvShows,
};

function matchesQuery(name: string, query: string) {
  const haystack = name.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function search(params: Record<string, string>) {
  const types = csv(params.types);
  const query = params.query ?? "";
  const take = Number(params.take ?? 10);
  const center = parseLatLon(params["filter.location"]) ?? DEFAULT_CENTER;
  const radiusM = params["filter.radius"]
    ? Number(params["filter.radius"]) * METRES_PER_MILE
    : Infinity;
  const results: unknown[] = [];

  if (types.length === 0 || types.includes("urn:entity:place")) {
    for (const place of places) {
      if (!matchesQuery(place.name, query)) continue;
      const { entity, distance } = placeEntity(place, center, "search");
      if (distance <= radiusM) results.push(entity);
    }
  }
  for (const type of types.length ? types : Object.keys(MEDIA)) {
    for (const item of MEDIA[type] ?? []) {
      if (matchesQuery(item.name, query)) results.push(mediaEntity(item, type, "search"));
    }
  }
  return { results: results.slice(0, take) };
}

function tags(params: Record<string, string>) {
  const query = (params["filter.query"] ?? "").toLowerCase();
  const take = Number(params.take ?? 10);
  const seen = new Set<string>();
  const results = TAG_MAP.filter(
    (entry) =>
      entry.display.toLowerCase().includes(query) ||
      entry.urns.some((urn) => lastSegment(urn).replace(/_/g, " ").includes(query)),
  )
    .flatMap((entry) => entry.urns.map((urn) => ({ urn, display: entry.display })))
    .filter(({ urn }) => !seen.has(urn) && seen.add(urn))
    .map(({ urn, display }) => ({
      id: urn,
      name: display,
      type: urn.split(":").slice(0, -1).join(":"),
      popularity: round(hash01(urn), 3),
      parents: [],
    }));
  return { results: { tags: results.slice(0, take) } };
}

function explainability(entityId: string, signals: string[]) {
  return signals
    .map((signal) => ({
      entity_id: signal,
      score: round(0.2 + 0.8 * hash01(`${signal}>${entityId}`), 3),
    }))
    .sort((a, b) => b.score - a.score);
}

function affinity(entityId: string, signalKey: string, boost = 0) {
  return round(Math.min(0.99, 0.78 + 0.08 * hash01(`${signalKey}|${entityId}`) + boost), 4);
}

function insightsPlaces(params: Record<string, string>, signals: string[], signalTags: string[]) {
  const point = parsePoint(params["filter.location"]);
  const center = point ?? DEFAULT_CENTER;
  const radiusM = Number(params["filter.location.radius"] ?? (point ? 5000 : Infinity));
  const filterTags = csv(params["filter.tags"]);
  const only = csv(params["filter.results.entities"]);
  const exclude = new Set(csv(params["filter.exclude.entities"]));
  const minPrice = Number(params["filter.price_level.min"] ?? 1);
  const maxPrice = Number(params["filter.price_level.max"] ?? 4);
  const signalKey = [...signals, ...signalTags, params["signal.demographics.age"] ?? ""].join(",");
  const explain = params["feature.explainability"] === "true";

  const entities = places
    .filter((place) => (only.length ? only.includes(place.id) : true))
    .filter((place) => !exclude.has(place.id))
    .filter((place) => !filterTags.length || filterTags.some((tag) => matchesTag(place.tags, tag)))
    .filter(
      (place) =>
        place.price_level === null ||
        (place.price_level >= minPrice && place.price_level <= maxPrice),
    )
    .map((place) => ({ place, ...placeEntity(place, center, "insights") }))
    .filter(({ distance }) => only.length > 0 || distance <= radiusM)
    .map(({ place, entity, distance }) => {
      const boost = signalTags.some((tag) => matchesTag(place.tags, tag)) ? 0.03 : 0;
      return {
        ...entity,
        query: {
          affinity: affinity(place.id, signalKey, boost),
          ...(point && !only.length ? { distance } : {}),
          ...(explain && signals.length
            ? { explainability: { "signal.interests.entities": explainability(place.id, signals) } }
            : {}),
        },
      };
    });
  return entities;
}

/** A place matches a filter tag through its genre or the matching category URN. */
function matchesTag(placeTags: readonly string[], tag: string) {
  return placeTags.some(
    (own) => own === tag || `urn:tag:category:place:${lastSegment(own)}` === tag,
  );
}

function heatmap(params: Record<string, string>, signals: string[]) {
  const center = parsePoint(params["filter.location"]) ?? DEFAULT_CENTER;
  const radiusM = Number(params["filter.location.radius"] ?? 3000);
  const key = signals.join(",");
  // Three hotspots whose positions depend on the signals.
  const spots = [0, 1, 2].map((i) => ({
    dx: (hash01(`${key}#x${i}`) - 0.5) * radiusM * 1.4,
    dy: (hash01(`${key}#y${i}`) - 0.5) * radiusM * 1.4,
    weight: 0.5 + hash01(`${key}#w${i}`) / 2,
  }));
  const steps = 14;
  const raw: Array<{ dx: number; dy: number; value: number; popularity: number }> = [];
  for (let ix = 0; ix <= steps; ix++) {
    for (let iy = 0; iy <= steps; iy++) {
      const dx = (ix / steps - 0.5) * 2 * radiusM;
      const dy = (iy / steps - 0.5) * 2 * radiusM;
      if (Math.hypot(dx, dy) > radiusM) continue;
      const value = spots.reduce(
        (sum, spot) =>
          sum +
          spot.weight *
            Math.exp(-((dx - spot.dx) ** 2 + (dy - spot.dy) ** 2) / (2 * (radiusM / 4) ** 2)),
        0,
      );
      raw.push({ dx, dy, value, popularity: 1 - Math.hypot(dx, dy) / radiusM });
    }
  }
  const max = Math.max(...raw.map((cell) => cell.value), 1e-9);
  const ranked = [...raw].sort((a, b) => b.value - a.value);
  return raw.map((cell, index) => ({
    location: {
      latitude: round(center.lat + cell.dy / METRES_PER_DEGREE, 6),
      longitude: round(
        center.lng + cell.dx / (METRES_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180)),
        6,
      ),
      geohash: `fix${index.toString(36).padStart(4, "0")}`,
    },
    query: {
      affinity: round(cell.value / max, 4),
      affinity_rank: ranked.indexOf(cell) + 1,
      popularity: round(cell.popularity, 4),
    },
  }));
}

const DEMOGRAPHIC_BANDS = [
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_to_44",
  "45_to_54",
  "55_and_older",
];

function demographics(signals: string[]) {
  return signals.map((entityId) => {
    const age = Object.fromEntries(
      DEMOGRAPHIC_BANDS.map((band) => [band, round(hash01(`${entityId}:${band}`) - 0.5, 3)]),
    );
    const male = round(hash01(`${entityId}:male`) - 0.5, 3);
    return { entity_id: entityId, query: { age, gender: { male, female: round(-male, 3) } } };
  });
}

function insights(params: Record<string, string>) {
  const type = params["filter.type"];
  const signals = csv(params["signal.interests.entities"]);
  const signalTags = csv(params["signal.interests.tags"]);
  const take = Number(params.take ?? 20);

  if (type === "urn:heatmap")
    return { success: true, results: { heatmap: heatmap(params, signals) } };
  if (type === "urn:demographics")
    return { success: true, results: { demographics: demographics(signals) } };

  let entities: Array<{ query: { affinity: number } }>;
  if (type === "urn:entity:place") {
    entities = insightsPlaces(params, signals, signalTags);
  } else {
    const signalKey = [...signals, ...signalTags].join(",");
    const explain = params["feature.explainability"] === "true";
    const input = new Set(signals);
    entities = (MEDIA[type] ?? [])
      .filter((item) => !input.has(item.id))
      .map((item) => ({
        ...mediaEntity(item, type, "insights"),
        query: {
          affinity: affinity(item.id, signalKey),
          ...(explain && signals.length
            ? { explainability: { "signal.interests.entities": explainability(item.id, signals) } }
            : {}),
        },
      }));
  }
  entities.sort((a, b) => b.query.affinity - a.query.affinity);
  return { success: true, results: { entities: entities.slice(0, take) } };
}

/** Returns a live-shaped JSON body for a guarded Qloo request. */
export function mockQlooResponse(path: QlooPath, params: Record<string, string>): unknown {
  switch (path) {
    case "/search":
      return search(params);
    case "/v2/tags":
      return tags(params);
    case "/v2/insights":
      return insights(params);
  }
}
