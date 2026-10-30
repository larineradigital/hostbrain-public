"use client";

import { Flame } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { GuidePin, PinSection } from "@/components/map/guide-map";
import { copy } from "@/lib/copy";
import type { HeatmapCell } from "@/lib/guide/types";
import { cn } from "@/lib/utils";

const t = copy.guest.guide;

const MapSkeleton = () => (
  <div
    className="flex h-80 w-full items-center justify-center rounded-2xl border bg-tint text-sm text-ink-muted sm:h-[440px]"
    aria-busy="true"
  >
    {t.map.loading}
  </div>
);

// MapLibre is large and needs the browser: load it only when the map scrolls near view.
const GuideMap = dynamic(() => import("@/components/map/guide-map"), {
  ssr: false,
  loading: MapSkeleton,
});

const LEGEND: Array<{ section: PinSection; dot: string }> = [
  { section: "eat", dot: "bg-section-eat" },
  { section: "drink", dot: "bg-section-drink" },
  { section: "do", dot: "bg-section-do" },
  { section: "rainy", dot: "bg-section-rainy" },
  { section: "host_picks", dot: "bg-section-picks" },
];

interface MapSectionProps {
  home: { lat: number; lng: number };
  pins: GuidePin[];
  heatmap: HeatmapCell[];
}

/** The map block of the guide: lazy map, "Your taste map" toggle and a legend. */
export function MapSection({ home, pins, heatmap }: MapSectionProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const present = new Set(pins.map((p) => p.section));
  return (
    <div className="flex flex-col gap-4">
      {heatmap.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-pressed={showHeatmap}
            onClick={() => setShowHeatmap((on) => !on)}
            className={cn(
              "inline-flex min-h-11 w-fit items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
              showHeatmap
                ? "border-brand bg-brand text-accent-ink"
                : "border-line bg-surface hover:border-ink",
            )}
          >
            <Flame className="size-4" aria-hidden />
            {t.map.tasteMap}
          </button>
          {showHeatmap && <p className="text-sm text-ink-muted">{t.map.tasteMapHint}</p>}
        </div>
      )}
      <div ref={sentinel}>
        {visible ? (
          <GuideMap
            home={{ ...home, label: t.map.home }}
            pins={pins}
            heatmap={heatmap}
            showHeatmap={showHeatmap}
            label={t.map.label}
          />
        ) : (
          <MapSkeleton />
        )}
      </div>
      <ul aria-label={t.map.legend} className="flex flex-wrap gap-2 text-sm">
        <li className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tint px-3 font-medium">
          <span className="size-2.5 rounded-full bg-ink" aria-hidden />
          {t.map.home}
        </li>
        {LEGEND.filter((entry) => present.has(entry.section)).map((entry) => (
          <li
            key={entry.section}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tint px-3 font-medium"
          >
            <span className={cn("size-2.5 rounded-full", entry.dot)} aria-hidden />
            {t.nav[entry.section]}
          </li>
        ))}
      </ul>
    </div>
  );
}
