"use client";

import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";

import { copy, fill } from "@/lib/copy";
import type { WeatherCondition, WeatherReport } from "@/lib/weather-codes";

const t = copy.guest.guide.weather;

const ICONS: Record<WeatherCondition, typeof Sun> = {
  clear: Sun,
  clearNight: Moon,
  partlyCloudy: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudRain,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

/** "18° and sunny today", from `/api/weather`. Hidden if the weather isn't available. */
export function WeatherChip({ token }: { token: string }) {
  const [state, setState] = useState<WeatherReport | "loading" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/weather?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<WeatherReport>) : Promise.reject()))
      .then(setState)
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [token]);

  if (state === "error") return null;
  const base =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold";
  if (state === "loading") {
    return (
      <span className={`${base} text-ink-muted`} aria-busy="true">
        <Sun className="size-4" aria-hidden />
        {t.loading}
      </span>
    );
  }
  const Icon = ICONS[state.now.condition];
  return (
    <span className={base} data-testid="weather-chip">
      <Icon className="size-4 text-sea" aria-hidden />
      {fill(t.chip, { temp: state.now.tempC, condition: t.conditions[state.now.condition] })}
    </span>
  );
}
