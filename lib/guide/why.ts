import type { WhyPayload } from "@/components/guide/why-this";

import { displayName } from "./format";
import type { GuideItem, SectionKind } from "./types";

/** What a card hands the "Why this?" sheet, from the item and where it ranked. Client-safe. */
export function whyPayloadFor(
  item: GuideItem,
  place: { section: SectionKind; rank: number; total: number; radiusM: number | null },
): WhyPayload {
  return {
    name: item.name,
    whyYou: item.why_you,
    section: place.section,
    category: item.category,
    distanceM: item.distance_m,
    signals: item.signals_used.map(displayName),
    explain: item.explain.map(({ name, score }) => ({ name: displayName(name), score })),
    rank: place.rank,
    total: place.total,
    radiusM: place.radiusM,
  };
}
