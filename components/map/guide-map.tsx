"use client";

import { useEffect, useRef } from "react";

import type { HeatmapCell } from "@/lib/guide/types";
import { cn } from "@/lib/utils";

import { mapStyle, maplibregl, tokenColor } from "./maplibre";

export type PinSection = "eat" | "drink" | "do" | "rainy" | "host_picks";

export interface GuidePin {
  id: string;
  name: string;
  section: PinSection;
  lat: number;
  lng: number;
}

/** Pin classes per section; the colours are theme tokens. */
export const PIN_CLASS: Record<PinSection, string> = {
  eat: "bg-section-eat text-accent-ink",
  drink: "bg-section-drink text-accent-ink",
  do: "bg-section-do text-accent-ink",
  rainy: "bg-section-rainy text-accent-ink",
  host_picks: "bg-section-picks text-accent-ink",
};

interface GuideMapProps {
  home: { lat: number; lng: number; label: string };
  pins: GuidePin[];
  heatmap: HeatmapCell[];
  showHeatmap: boolean;
  label: string;
  className?: string;
}

const HEAT_SOURCE = "taste-heatmap";
const HEAT_LAYER = "taste-heatmap";
/** Cells at or above this affinity are framed when the taste map is turned on. */
const HOT_AFFINITY = 0.5;

/** "#2f6b7a" (a token value) → "rgba(47, 107, 122, 0.4)". Other formats pass through. */
function withAlpha(color: string, alpha: number) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function pinElement(pin: GuidePin) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", pin.name);
  el.className = cn(
    "flex size-7 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold shadow-float transition-transform hover:scale-110",
    PIN_CLASS[pin.section],
  );
  if (pin.section === "host_picks") el.textContent = "★";
  return el;
}

/** The guide map (G4): section-coloured pins, the stay, and the "Your taste map" layer. */
export default function GuideMap({
  home,
  pins,
  heatmap,
  showHeatmap,
  label,
  className,
}: GuideMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const showHeatmapRef = useRef(showHeatmap);

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: mapStyle(),
      center: [home.lng, home.lat],
      zoom: 14,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    new maplibregl.Marker({ color: tokenColor("--ink") })
      .setLngLat([home.lng, home.lat])
      .setPopup(new maplibregl.Popup({ offset: 24, closeButton: false }).setText(home.label))
      .addTo(instance);
    const bounds = new maplibregl.LngLatBounds([home.lng, home.lat], [home.lng, home.lat]);
    for (const pin of pins) {
      new maplibregl.Marker({ element: pinElement(pin) })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText(pin.name))
        .addTo(instance);
      bounds.extend([pin.lng, pin.lat]);
    }
    if (pins.length) instance.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });

    instance.on("load", () => {
      if (!heatmap.length) return;
      instance.addSource(HEAT_SOURCE, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: heatmap.map((cell) => ({
            type: "Feature",
            properties: { affinity: cell.affinity },
            geometry: { type: "Point", coordinates: [cell.lng, cell.lat] },
          })),
        },
      });
      const sea = tokenColor("--sea");
      const brand = tokenColor("--brand");
      instance.addLayer({
        id: HEAT_LAYER,
        type: "heatmap",
        source: HEAT_SOURCE,
        layout: { visibility: showHeatmapRef.current ? "visible" : "none" },
        paint: {
          // Qloo's affinity is skewed (most cells near 0), so lift the middle with a sqrt.
          "heatmap-weight": ["^", ["max", ["get", "affinity"], 0], 0.5],
          "heatmap-intensity": 1.2,
          // Cells are a fixed size on the ground, so the radius doubles with each zoom level.
          "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, 10, 16, 640],
          "heatmap-opacity": 0.8,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            withAlpha(sea, 0),
            0.15,
            withAlpha(sea, 0.3),
            0.45,
            withAlpha(brand, 0.45),
            1,
            withAlpha(brand, 0.75),
          ],
        },
      });
    });

    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
    // The map is created once per guide; the heatmap toggle is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const firstRun = showHeatmapRef.current === showHeatmap;
    showHeatmapRef.current = showHeatmap;
    const instance = map.current;
    if (!instance || firstRun) return;
    if (instance.getLayer(HEAT_LAYER)) {
      instance.setLayoutProperty(HEAT_LAYER, "visibility", showHeatmap ? "visible" : "none");
    }
    // Bring the warmest areas into view: they can sit outside the pins' bounds.
    const hot = heatmap.filter((cell) => cell.affinity >= HOT_AFFINITY);
    if (showHeatmap && hot.length) {
      const bounds = new maplibregl.LngLatBounds([home.lng, home.lat], [home.lng, home.lat]);
      for (const cell of hot) bounds.extend([cell.lng, cell.lat]);
      instance.fitBounds(bounds, { padding: 48, maxZoom: 15 });
    }
  }, [showHeatmap, heatmap, home.lat, home.lng]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className={cn(
        "h-80 w-full overflow-hidden rounded-2xl border bg-tint sm:h-[440px]",
        className,
      )}
    />
  );
}
