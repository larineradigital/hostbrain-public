/**
 * The local time at a property, for the concierge's "tonight" and "now". Properties store
 * a country code, not a time zone, so this maps single-zone countries (and the demo
 * cities' countries) to their zone. Anything else falls back to UTC, and the prompt says so.
 */
const ZONES: Record<string, string> = {
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  GR: "Europe/Athens",
  TR: "Europe/Istanbul",
  DK: "Europe/Copenhagen",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  FI: "Europe/Helsinki",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  HU: "Europe/Budapest",
  HR: "Europe/Zagreb",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  SG: "Asia/Singapore",
  TH: "Asia/Bangkok",
  AE: "Asia/Dubai",
  IN: "Asia/Kolkata",
  NZ: "Pacific/Auckland",
};

export function timeZoneFor(countryCode: string | null): string | null {
  return (countryCode && ZONES[countryCode.toUpperCase()]) || null;
}

/** "Saturday 24 October 2026, 19:05" in the property's zone (or UTC). */
export function localTime(now: Date, countryCode: string | null) {
  const zone = timeZoneFor(countryCode);
  const text = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone ?? "UTC",
  }).format(now);
  return { text: text.replace(" at ", ", "), zone: zone ?? "UTC" };
}
