/**
 * Pure rules behind the demo: where the seed may write, how a demo search result is chosen,
 * what "Try as a guest" does, and the side-by-side preview on /demo and the landing page.
 * No I/O here, so it is unit-tested directly.
 */

import type { QlooMode } from "@/lib/env";
import { PLACE_SECTIONS, type GuideItem, type SectionKind } from "@/lib/guide/types";

// ---------------------------------------------------------------------------------------
// Seeding

export const isLocalSupabaseUrl = (url: string | undefined) => {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
};

/**
 * The seed and warm-cache scripts write to Supabase. Local by default; a hosted project only
 * with `--env production`, so a stray .env never seeds the wrong database.
 */
export function assertSeedTarget(url: string | undefined, envName: "local" | "production") {
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (envName === "local" && !isLocalSupabaseUrl(url)) {
    throw new Error(
      "Refusing to seed a non-local Supabase. Pass --env production to seed a hosted project.",
    );
  }
}

/** Lower-case letters and digits only: "Fred again.." → "fredagain". */
export const searchKey = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Picks the entity a demo taste pick means from a fuzzy Qloo search: an exact name match of
 * the wanted type first, then any exact name match, then the first result of the wanted type.
 */
export function pickSearchMatch<T extends { name: string; types: readonly string[] }>(
  results: readonly T[],
  query: string,
  wantType?: string,
): T | null {
  const key = searchKey(query);
  const ofType = (e: T) => !wantType || e.types.includes(wantType);
  const exact = (e: T) => searchKey(e.name) === key;
  return (
    results.find((e) => exact(e) && ofType(e)) ??
    results.find(exact) ??
    results.find(ofType) ??
    null
  );
}

/** Stay dates for demo guides: from `today` for `nights` nights, as ISO dates. */
export function demoStayDates(today: Date, nights = 4) {
  const day = (offset: number) => {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset),
    );
    return date.toISOString().slice(0, 10);
  };
  return { checkIn: day(0), checkOut: day(nights) };
}

// ---------------------------------------------------------------------------------------
// Try as a guest

export type TryDecision =
  | { kind: "create" }
  /** Live generation is off (replay mode) or the demo is busy: open a ready guide instead. */
  | { kind: "fallback"; reason: "paused" | "busy" };

export function decideTry({
  qlooMode,
  quotaAllowed,
  ipAllowed,
}: {
  qlooMode: QlooMode;
  quotaAllowed: boolean;
  ipAllowed: boolean;
}): TryDecision {
  if (qlooMode === "replay") return { kind: "fallback", reason: "paused" };
  if (!quotaAllowed || !ipAllowed) return { kind: "fallback", reason: "busy" };
  return { kind: "create" };
}

// ---------------------------------------------------------------------------------------
// Side-by-side preview

export interface PreviewSection {
  section: SectionKind;
  items: Array<Pick<GuideItem, "entity_id" | "name" | "category">>;
}

const PREVIEW_ORDER: readonly SectionKind[] = ["eat", "drink", "do", "playlist", "films"];

/** The first `perSection` items of the sections /demo compares, in a fixed order. */
export function previewSections(
  sections: ReadonlyArray<{ section: SectionKind; items: readonly GuideItem[] }>,
  perSection = 3,
): PreviewSection[] {
  return PREVIEW_ORDER.flatMap((kind) => {
    const section = sections.find((s) => s.section === kind);
    if (!section?.items.length) return [];
    return [
      {
        section: kind,
        items: section.items.slice(0, perSection).map(({ entity_id, name, category }) => ({
          entity_id,
          name,
          category,
        })),
      },
    ];
  });
}

const placeIds = (sections: ReadonlyArray<{ section: SectionKind; items: readonly GuideItem[] }>) =>
  new Set(
    sections
      .filter((s) => (PLACE_SECTIONS as readonly string[]).includes(s.section))
      .flatMap((s) => s.items.map((item) => item.entity_id)),
  );

/** How many places two guides share, out of how many each shows. */
export function placeOverlap(
  a: ReadonlyArray<{ section: SectionKind; items: readonly GuideItem[] }>,
  b: ReadonlyArray<{ section: SectionKind; items: readonly GuideItem[] }>,
) {
  const left = placeIds(a);
  const right = placeIds(b);
  const shared = [...left].filter((id) => right.has(id)).length;
  return { shared, left: left.size, right: right.size };
}
