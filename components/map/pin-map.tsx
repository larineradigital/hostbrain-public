"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { mapStyle, maplibregl, tokenColor } from "./maplibre";

interface PinMapProps {
  lat: number;
  lng: number;
  /** Called when the host drags the pin or clicks the map. */
  onMove?: (point: { lat: number; lng: number }) => void;
  className?: string;
  label?: string;
}

/** MapLibre map (OpenFreeMap tiles, no key) with one draggable pin. */
export default function PinMap({
  lat,
  lng,
  onMove,
  className,
  label = "Property location",
}: PinMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const onMoveRef = useRef(onMove);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: mapStyle(),
      center: [lng, lat],
      zoom: 15,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const pin = new maplibregl.Marker({
      color: tokenColor("--brand"),
      draggable: !!onMoveRef.current,
    })
      .setLngLat([lng, lat])
      .addTo(instance);
    pin.on("dragend", () => {
      const { lat: newLat, lng: newLng } = pin.getLngLat();
      onMoveRef.current?.({ lat: newLat, lng: newLng });
    });
    instance.on("click", (event) => {
      if (!onMoveRef.current) return;
      pin.setLngLat(event.lngLat);
      onMoveRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    map.current = instance;
    marker.current = pin;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; position changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = marker.current?.getLngLat();
    if (!current || (Math.abs(current.lat - lat) < 1e-7 && Math.abs(current.lng - lng) < 1e-7))
      return;
    marker.current?.setLngLat([lng, lat]);
    map.current?.easeTo({ center: [lng, lat], duration: 400 });
  }, [lat, lng]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className={cn("h-64 w-full overflow-hidden rounded-2xl border bg-tint", className)}
    />
  );
}
