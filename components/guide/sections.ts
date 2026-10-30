import {
  Clapperboard,
  Landmark,
  Map,
  Music,
  Star,
  Tv,
  Umbrella,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";

import type { SectionKind } from "@/lib/guide/types";

/** One icon per section: nav pills, section titles, image fallbacks. */
export const SECTION_ICON: Record<SectionKind | "map", LucideIcon> = {
  eat: UtensilsCrossed,
  drink: Wine,
  do: Landmark,
  rainy: Umbrella,
  host_picks: Star,
  playlist: Music,
  films: Clapperboard,
  shows: Tv,
  map: Map,
};

/** The section colour as a text colour (icons). */
export const SECTION_TEXT: Record<SectionKind | "map", string> = {
  eat: "text-section-eat",
  drink: "text-section-drink",
  do: "text-section-do",
  rainy: "text-section-rainy",
  host_picks: "text-section-picks",
  playlist: "text-section-media",
  films: "text-section-media",
  shows: "text-section-media",
  map: "text-sea",
};
