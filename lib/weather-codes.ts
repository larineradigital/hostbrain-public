/**
 * Open-Meteo WMO weather codes → the condition words in `messages/en.json`
 * (`guest.guide.weather.conditions`). Shared by the server and the weather chip.
 */
export const WEATHER_CONDITIONS = [
  "clear",
  "clearNight",
  "partlyCloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "snow",
  "storm",
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export function weatherCondition(code: number, isDay = true): WeatherCondition {
  if (code <= 1) return isDay ? "clear" : "clearNight";
  if (code === 2) return "partlyCloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

/** Rain, drizzle, snow or storms: a day for the indoor picks. */
export const isWetCondition = (condition: WeatherCondition) =>
  condition === "drizzle" || condition === "rain" || condition === "snow" || condition === "storm";

/** What `/api/weather` returns. */
export interface WeatherReport {
  now: { tempC: number; condition: WeatherCondition };
  days: Array<{ date: string; maxC: number; minC: number; condition: WeatherCondition }>;
}
