import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Our chip labels and guide sections → Qloo tag URNs, seeded into `qloo_tag_map`.
 *
 * Every URN here returned places as `filter.tags` at the Lisbon test point (Oct 20, 2026).
 * Qloo answers an unknown tag with 200 and no results, and several URNs that `/v2/tags`
 * lists match no places at all, so never add one by guesswork: find it with `/v2/tags`,
 * then check that a `/v2/insights` place query filtered on it returns results.
 */

export type TagKind = "section" | "cuisine" | "vibe" | "dietary";

export interface TagMapEntry {
  /** Stable slug, primary key in `qloo_tag_map`. */
  label: string;
  kind: TagKind;
  /** Chip text shown to guests (sections use it in logs only). */
  display: string;
  urns: readonly string[];
}

const place = (genre: string) => `urn:tag:genre:place:${genre}`;
const restaurant = (genre: string) => `urn:tag:genre:place:restaurant:${genre}`;
const ambience = (name: string) => `urn:tag:ambience:qloo:${name}`;
const dietary = (name: string) => `urn:tag:dietary_option:qloo:${name}`;

const INDOOR = [
  place("museum"),
  place("art_gallery"),
  "urn:tag:category:place:movie_theater", // no genre:place URN exists for cinemas
  place("spa"),
  place("book_store"),
];

/**
 * Section filter tags for Q5 (`filter.tags` matches any). Keys cover the guide sections
 * and the concierge's `recommend_places` categories.
 */
export const SECTION_TAGS = {
  eat: [place("restaurant")],
  drink: [
    restaurant("bar"),
    restaurant("wine_bar"),
    restaurant("cocktail_bar"),
    restaurant("cafe"),
    restaurant("coffee_shop"),
    place("brewery"),
  ],
  /** Drink for families: no bars (see lib/guide/family-filter.ts). */
  drink_family: [restaurant("cafe"), restaurant("coffee_shop"), restaurant("ice_cream_shop")],
  do: [
    place("museum"),
    place("art_gallery"),
    place("park"),
    place("live_music_venue"),
    place("market"),
    place("tourist_attraction"),
    place("book_store"),
  ],
  rainy: INDOOR,
  indoor: INDOOR,
  family: [ambience("family_friendly")],
  coffee: [restaurant("cafe"), restaurant("coffee_shop")],
  late_night: [
    restaurant("bar"),
    restaurant("cocktail_bar"),
    place("live_music_venue"),
    place("night_club"),
    place("jazz_club"),
  ],
  outdoors: [place("park"), place("market"), place("tourist_attraction")],
} as const satisfies Record<string, readonly string[]>;
export type SectionTagKey = keyof typeof SECTION_TAGS;

const chip = (kind: TagKind, label: string, display: string, ...urns: string[]): TagMapEntry => ({
  label,
  kind,
  display,
  urns,
});

export const TAG_MAP: readonly TagMapEntry[] = [
  ...Object.entries(SECTION_TAGS).map(([label, urns]) =>
    chip("section", `section_${label}`, label, ...urns),
  ),
  // Food chips (quiz step 3), sent as signal.interests.tags.
  chip("cuisine", "portuguese", "Portuguese", restaurant("portuguese")),
  chip("cuisine", "seafood", "Seafood", restaurant("seafood")),
  chip("cuisine", "italian", "Italian", restaurant("italian")),
  chip("cuisine", "japanese", "Japanese", restaurant("japanese")),
  chip("cuisine", "street_food", "Street food", "urn:tag:cuisine:qloo:street_food"),
  chip("cuisine", "bakery", "Bakeries", restaurant("bakery")),
  chip("cuisine", "vegetarian_food", "Vegetarian", restaurant("vegetarian")),
  chip("cuisine", "vegan_food", "Vegan", restaurant("vegan")),
  // genre:place:restaurant:natural_wine matches no places; the cuisine URN does.
  chip("cuisine", "natural_wine", "Natural wine", "urn:tag:cuisine:qloo:natural_wine"),
  chip("cuisine", "wine_bars", "Wine bars", restaurant("wine_bar")),
  chip("cuisine", "cocktails", "Cocktails", restaurant("cocktail_bar")),
  chip("cuisine", "coffee", "Coffee", restaurant("coffee_shop")),
  // Vibe chips. ambience:place:* URNs exist but match nothing; ambience:qloo:* work.
  chip("vibe", "cosy", "Cosy", ambience("cozy")),
  chip("vibe", "lively", "Lively", ambience("lively")),
  chip("vibe", "romantic", "Romantic", ambience("romantic")),
  chip("vibe", "rooftop", "Rooftop", "urn:tag:setting:qloo:rooftop"),
  // good_for:qloo:family_friendly matches no places; ambience:qloo:family_friendly does.
  chip("vibe", "family_friendly", "Family-friendly", ambience("family_friendly")),
  chip("vibe", "live_music", "Live music", place("live_music_venue"), place("jazz_club")),
  chip("vibe", "art", "Art and galleries", place("art_gallery")),
  chip("vibe", "markets", "Markets", place("market")),
  // Dietary toggles: used as filters and in copy.
  chip("dietary", "vegetarian", "Vegetarian", dietary("vegetarian")),
  chip("dietary", "vegan", "Vegan", dietary("vegan")),
  chip("dietary", "halal", "Halal", dietary("halal")),
  chip("dietary", "gluten_free", "Gluten-free", dietary("gluten_free")),
];

const KNOWN_URNS = new Set(TAG_MAP.flatMap((entry) => entry.urns));

/** True when a URN is in our confirmed map. Use it before sending tags we chose ourselves. */
export const isKnownTagUrn = (urn: string) => KNOWN_URNS.has(urn);

export const tagEntry = (label: string) => TAG_MAP.find((entry) => entry.label === label);

/** URNs for chip labels the guest picked; unknown labels are ignored. */
export const urnsForLabels = (labels: readonly string[]) => [
  ...new Set(labels.flatMap((label) => tagEntry(label)?.urns ?? [])),
];

/** Upserts the map into `qloo_tag_map` (service-role client). */
export async function seedTagMap(db: SupabaseClient): Promise<number> {
  const rows = TAG_MAP.map((entry, position) => ({
    label: entry.label,
    kind: entry.kind,
    display: entry.display,
    urns: [...entry.urns],
    position,
  }));
  const { error } = await db.from("qloo_tag_map").upsert(rows, { onConflict: "label" });
  if (error) throw new Error(`qloo_tag_map seed failed: ${error.message}`);
  return rows.length;
}
