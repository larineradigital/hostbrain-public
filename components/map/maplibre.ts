"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";

import { version as MAPLIBRE_VERSION } from "maplibre-gl/package.json";

// Served from public/ by scripts/copy-maplibre-worker.mjs (the bundler doesn't emit it).
maplibregl.setWorkerUrl(`/vendor/maplibre/worker-${MAPLIBRE_VERSION}.mjs`);

export { maplibregl };

/** Calm basemaps, so the section-coloured pins stand out: Positron by day, Dark by night. */
export function mapStyle() {
  const dark = document.documentElement.classList.contains("dark");
  return `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
}

/** Reads a design token so map markers use the theme colours (no hex in components). */
export function tokenColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
