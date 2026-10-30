export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: Point, b: Point): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Walking minutes at about 4.8 km/h, rounded up, at least 1. */
export function walkingMinutes(metres: number): number {
  return Math.max(1, Math.ceil(metres / 80));
}

/** "650 m" or "1.4 km". */
export function formatDistance(metres: number): string {
  if (metres < 950) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
