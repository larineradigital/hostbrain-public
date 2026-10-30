/**
 * The family filter: for a family, no bars, pubs, breweries, wine bars,
 * beer or wine museums or other places whose point is alcohol, outside the Eat section.
 *
 * "Serves alcohol" is not enough to drop a place: most restaurants and many museums carry
 * `offerings:place:alcohol`, `beverage_offering:qloo:wine` or `amenity:qloo:bar`. We drop a
 * place when Qloo says drinking is what it is about: its genre or category, its culinary
 * style, or its activity, interest or crowd tags. The name is only a backstop, for places
 * whose tags are thin. Pure, so it is tested directly.
 */

/** Genre and category kinds (the last URN segment) that are bars or alcohol places. */
const ALCOHOL_KINDS = new Set([
  "bar",
  "beer_bar",
  "beer_garden",
  "beer_hall",
  "brewery",
  "brewpub",
  "cocktail_bar",
  "cocktail_lounge",
  "distillery",
  "gastropub",
  "hookah_bar",
  "irish_pub",
  "jazz_club",
  "karaoke_bar",
  "liquor_store",
  "lounge",
  "night_club",
  "nightclub",
  "pub",
  "speakeasy",
  "sports_bar",
  "taproom",
  "tavern",
  "wine_bar",
  "wine_cellar",
  "wine_club",
  "wine_store",
  "winery",
]);

/**
 * Words that make a theme tag (activity, interest, crowd, culinary style) about drinking:
 * `activity_type:qloo:beer_tasting`, `interests:qloo:oenology`,
 * `customer_identity:qloo:cocktail_enthusiasts`. "bar" alone is not here: "sushi_bar" and
 * "juice_bar" are fine; `culinary_style:qloo:bar` is matched as a whole segment instead. No
 * "brewing" either: `interests:qloo:slow_coffee_brewing` is a coffee shop.
 */
const DRINK_WORDS = new Set([
  "beer",
  "beers",
  "brewery",
  "breweries",
  "brewpub",
  "cocktail",
  "cocktails",
  "distillery",
  "gin",
  "liquor",
  "mixology",
  "nightlife",
  "oenology",
  "pub",
  "pubs",
  "spirits",
  "taproom",
  "whiskey",
  "whisky",
  "wine",
  "wines",
  "winery",
]);

/** Theme tag types read with DRINK_WORDS. Offerings and amenities only say what's served. */
const THEME_TAG = /^urn:tag:(activity_type|interests|customer_identity|culinary_style):qloo:/;
const KIND_TAG = /^urn:tag:(genre|category):place:/;
const BAR_STYLES = new Set(["bar", "pub", "wine_bar", "cocktail_bar", "brewpub", "gastropub"]);

/**
 * Whole words in a place name. No "bar": in Portugal a café is often a "snack-bar".
 * English, Portuguese, Spanish, Italian, German and Turkish, for the demo cities.
 */
const NAME_WORDS = new Set([
  "adega",
  "beer",
  "biergarten",
  "bierhaus",
  "bira",
  "birahane",
  "birreria",
  "brauhaus",
  "brewery",
  "cerveceria",
  "cervecería",
  "cerveja",
  "cervejaria",
  "cocktail",
  "cocktails",
  "distillery",
  "enoteca",
  "meyhane",
  "pub",
  "sarap",
  "şarap",
  "taproom",
  "tavern",
  "vinho",
  "vinhos",
  "vinoteca",
  "whiskey",
  "whisky",
  "wine",
  "winery",
  "wines",
]);

/** What the filter reads from a Qloo entity. */
export interface PlaceTags {
  name: string;
  tags: ReadonlyArray<{ id: string }>;
}

const lastSegment = (urn: string) => urn.split(":").at(-1) ?? urn;
const words = (text: string) =>
  text
    .toLocaleLowerCase("en")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

/** Which rule flagged a place, for tests and debugging; null when it's fine for families. */
export function alcoholReason(entity: PlaceTags): string | null {
  for (const { id } of entity.tags) {
    const segment = lastSegment(id);
    if (KIND_TAG.test(id) && ALCOHOL_KINDS.has(segment)) return id;
    if (id.startsWith("urn:tag:culinary_style:qloo:") && BAR_STYLES.has(segment)) return id;
    if (THEME_TAG.test(id) && segment.split("_").some((w) => DRINK_WORDS.has(w))) return id;
  }
  const word = words(entity.name).find((w) => NAME_WORDS.has(w));
  return word ? `name:${word}` : null;
}

export const isAlcoholThemed = (entity: PlaceTags) => alcoholReason(entity) !== null;

/**
 * Whether a place may be shown to this party in this section. Eat is exempt: a family can
 * have dinner at a restaurant that also has a bar (its results are restaurants only).
 */
export const familyAllows = (
  entity: PlaceTags,
  { family, section }: { family: boolean; section: string },
) => !family || section === "eat" || !isAlcoholThemed(entity);
