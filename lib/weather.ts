import "server-only";

import { z } from "zod";

import { readServerEnv } from "@/lib/env";
import type { Point } from "@/lib/geo/distance";

import { weatherCondition, type WeatherReport } from "./weather-codes";

/**
 * Today's and tomorrow's weather from Open-Meteo: free, keyless, server-side only, so
 * guests' IPs aren't sent to a third party. Only the property's coordinates go out.
 * `WEATHER_MODE=mock` returns a fixed synthetic report (e2e and offline work).
 */
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 500;

const responseSchema = z.looseObject({
  current: z.looseObject({
    temperature_2m: z.number(),
    weather_code: z.number(),
    is_day: z.number().optional(),
  }),
  daily: z.looseObject({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
  }),
});

export const MOCK_WEATHER: WeatherReport = {
  now: { tempC: 18, condition: "clear" },
  days: [
    { date: "2026-10-24", maxC: 21, minC: 14, condition: "clear" },
    { date: "2026-10-25", maxC: 17, minC: 13, condition: "rain" },
  ],
};

export function toWeatherReport(raw: unknown): WeatherReport | null {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { current, daily } = parsed.data;
  return {
    now: {
      tempC: Math.round(current.temperature_2m),
      condition: weatherCondition(current.weather_code, current.is_day !== 0),
    },
    days: daily.time.slice(0, 2).flatMap((date, i) => {
      const code = daily.weather_code[i];
      const maxC = daily.temperature_2m_max[i];
      const minC = daily.temperature_2m_min[i];
      if (code === undefined || maxC === undefined || minC === undefined) return [];
      return [
        { date, maxC: Math.round(maxC), minC: Math.round(minC), condition: weatherCondition(code) },
      ];
    }),
  };
}

const cache = new Map<string, { at: number; report: WeatherReport }>();

/** The weather at a point, cached for 30 minutes per ~1 km cell. Null if unavailable. */
export async function getWeather(point: Point, now = Date.now()): Promise<WeatherReport | null> {
  if (readServerEnv().WEATHER_MODE === "mock") return MOCK_WEATHER;
  const lat = point.lat.toFixed(2);
  const lng = point.lng.toFixed(2);
  const key = `${lat},${lng}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.report;

  const url = new URL(OPEN_METEO_URL);
  url.search = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: "temperature_2m,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "2",
  }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const report = toWeatherReport(await response.json());
    if (!report) return null;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: now, report });
    return report;
  } catch {
    return null;
  }
}
