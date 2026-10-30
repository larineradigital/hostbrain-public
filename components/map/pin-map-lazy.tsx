"use client";

import dynamic from "next/dynamic";

/** MapLibre needs the browser; load it on the client only. */
export const PinMapLazy = dynamic(() => import("./pin-map"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg border bg-tint" />,
});
