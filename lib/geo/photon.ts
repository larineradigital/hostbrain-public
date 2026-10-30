import "server-only";

import { z } from "zod";

/**
 * Address autocomplete with Photon (komoot), free and keyless. Server-side only, so
 * guests' and hosts' IPs aren't sent to a third party and results can be cached.
 */
const PHOTON_URL = "https://photon.komoot.io/api/";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 1000;

export interface AddressSuggestion {
  id: string;
  label: string;
  /** Short line under the label: city, country. */
  detail: string;
  address: string;
  city: string;
  countryCode?: string;
  lat: number;
  lng: number;
}

const featureSchema = z.looseObject({
  geometry: z.looseObject({ coordinates: z.tuple([z.number(), z.number()]).rest(z.number()) }),
  properties: z.looseObject({
    osm_type: z.string().optional(),
    osm_id: z.number().optional(),
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    postcode: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    countrycode: z.string().optional(),
  }),
});

const responseSchema = z.looseObject({
  features: z.array(z.unknown()).catch([]),
});

export function toSuggestion(raw: unknown): AddressSuggestion | null {
  const parsed = featureSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { properties: p, geometry } = parsed.data;
  const [lng, lat] = geometry.coordinates;
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(" ");
  const label = p.name && p.name !== p.street ? p.name : streetLine || p.name;
  const city = p.city ?? p.district ?? p.county ?? p.state ?? p.name;
  if (!label || !city) return null;
  const address = [label === streetLine ? "" : label, streetLine, p.postcode, city, p.country]
    .filter(Boolean)
    .join(", ");
  return {
    id: `${p.osm_type ?? "x"}${p.osm_id ?? `${lat},${lng}`}`,
    label,
    detail: [streetLine !== label ? streetLine : "", city, p.country].filter(Boolean).join(", "),
    address,
    city,
    countryCode: p.countrycode?.toUpperCase(),
    lat,
    lng,
  };
}

const cache = new Map<string, { at: number; items: AddressSuggestion[] }>();

export async function autocompleteAddress(
  query: string,
  {
    bias,
    lang = "en",
    fetchImpl = fetch,
  }: { bias?: { lat: number; lng: number }; lang?: string; fetchImpl?: typeof fetch } = {},
): Promise<AddressSuggestion[]> {
  const q = query.trim().replace(/\s+/g, " ");
  const key = `${lang}|${q.toLowerCase()}|${bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", lang);
  if (bias) {
    url.searchParams.set("lat", String(bias.lat));
    url.searchParams.set("lon", String(bias.lng));
  }
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "HostBrain/0.1 (+https://github.com/larinera/host-brain)" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Photon responded ${res.status}`);
  const body = responseSchema.parse(await res.json());
  const seen = new Set<string>();
  const items = body.features
    .map(toSuggestion)
    .filter((s): s is AddressSuggestion => !!s && !seen.has(s.address) && !!seen.add(s.address));

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), items });
  return items;
}
