/**
 * Small display helpers for the guide page. Pure and client-safe (no server imports).
 */

const EURO = new Set(
  "AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES MC SM VA AD ME XK".split(" "),
);
const CURRENCY: Record<string, string> = Object.fromEntries(
  "GB:£ US:$ CA:$ AU:$ NZ:$ MX:$ JP:¥ CN:¥ TR:₺ IN:₹ KR:₩ CH:₣ BR:R$ TH:฿"
    .split(" ")
    .map((pair) => pair.split(":")),
);

/** "€€" for price level 2 in Lisbon. Euro when the country is unknown. */
export function priceSymbols(level: number, countryCode: string | null) {
  const code = countryCode?.toUpperCase() ?? "";
  const symbol = CURRENCY[code] ?? (EURO.has(code) || !code ? "€" : "$");
  return symbol.repeat(Math.max(1, Math.min(4, level)));
}

/** "24–28 Oct" from two plain dates; null if either is missing or malformed. */
export function formatStayDates(checkIn: string | null, checkOut: string | null) {
  if (!checkIn || !checkOut) return null;
  const from = new Date(`${checkIn}T00:00:00Z`);
  const to = new Date(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatRange(from, to);
}

/** A maps search for the venue by name and address (works on every phone, no key). */
export function mapsUrl(
  place: { name: string; address: string | null; lat: number | null; lng: number | null },
  city: string,
) {
  const query = place.address
    ? [place.name, place.address, city].join(", ")
    : place.lat !== null && place.lng !== null
      ? `${place.lat},${place.lng}`
      : [place.name, city].join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export const spotifySearchUrl = (name: string) =>
  `https://open.spotify.com/search/${encodeURIComponent(name)}`;

export const appleMusicSearchUrl = (name: string) =>
  `https://music.apple.com/search?term=${encodeURIComponent(name)}`;

/** Qloo age buckets ("25_to_29", "55_and_older") as words. */
export const ageBandLabel = (band: string) => band.replace(/_/g, " ").trim();

/** A Qloo demographics band for the "taste twins" line: "25–29", "under 25", "55 and over". */
export function audienceBandLabel(band: string | null): string | null {
  if (!band) return null;
  if (band === "24_and_younger") return "under 25";
  if (band === "55_and_older") return "55 and over";
  const range = /^(\d+)_to_(\d+)$/.exec(band);
  return range ? `${range[1]}–${range[2]}` : null;
}

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
]);

/**
 * Qloo spells some names in capitals ("PEGGY GOU"). Turns those into "Peggy Gou" for display
 * and for the writer. Short all-caps names that are styled that way on purpose ("ABBA",
 * "AC/DC", "BTS") are kept: only names with two or more words of three or more letters change.
 */
export function displayName(name: string): string {
  if (/\p{Ll}/u.test(name) || !/\p{Lu}/u.test(name)) return name;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.filter((w) => (w.match(/\p{L}/gu)?.length ?? 0) >= 3).length < 2) return name;
  return words
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("en");
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(
        /^(\P{L}*)(\p{L})/u,
        (_, lead: string, first: string) => lead + first.toLocaleUpperCase("en"),
      );
    })
    .join(" ");
}

/** Runs of capitalised words inside a sentence, for displayNamesIn. */
const CAPS_RUN = /(?<!\p{L})\p{Lu}[\p{Lu}'’.-]*(?:\s+\p{Lu}[\p{Lu}'’.-]*)+(?!\p{L})/gu;

/** displayName for every all-caps name inside a sentence ("who love PEGGY GOU and …"). */
export const displayNamesIn = (text: string) => text.replace(CAPS_RUN, displayName);
