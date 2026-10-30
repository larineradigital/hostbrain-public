import "server-only";

import { createServiceClient } from "@/lib/db/server";

import { displayName } from "./format";
import { guideItemSchema, heatmapCellSchema, SECTION_KINDS } from "./types";
import type { GuideItem, HeatmapCell, SectionKind } from "./types";

/**
 * Everything the guest guide page (G4) shows, read with the service role after the
 * token was checked by `getGuideByToken`. Items are re-validated on the way out: a row
 * that doesn't parse is dropped, never rendered half-filled.
 */

export interface GuideViewSection {
  section: SectionKind;
  intro: string;
  items: GuideItem[];
  /** Search radius the places were found in (place sections only). */
  radiusM: number | null;
}

export interface GuideView {
  heroLine: string | null;
  checkIn: string | null;
  checkOut: string | null;
  ageBand: string | null;
  /** Q11: the age band people who share the guest's picks skew towards (stored, not live). */
  audienceAgeBand: string | null;
  property: {
    name: string;
    city: string;
    address: string;
    lat: number;
    lng: number;
    countryCode: string | null;
    houseNotes: string | null;
  };
  /** The guest's quiz picks by name, for the "How your guide was picked" sheet. */
  signals: string[];
  /** Non-empty sections, in `SECTION_KINDS` order. */
  sections: GuideViewSection[];
  heatmap: HeatmapCell[];
}

export function parseItems(raw: unknown): GuideItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = guideItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseHeatmap(raw: unknown): HeatmapCell[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((cell) => {
    const parsed = heatmapCellSchema.safeParse(cell);
    return parsed.success ? [parsed.data] : [];
  });
}

function radiusOf(request: unknown) {
  if (!request || typeof request !== "object" || !("radius_m" in request)) return null;
  const value = (request as { radius_m: unknown }).radius_m;
  return typeof value === "number" ? value : null;
}

/** Title-cases a tag slug: "natural_wine" → "Natural wine". */
const labelFromSlug = (slug: string) => {
  const words = slug.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export async function loadGuideView(guideId: string): Promise<GuideView | null> {
  const db = createServiceClient();
  const [guide, sections, heatmap, quiz] = await Promise.all([
    db
      .from("guides")
      .select(
        "hero_line, check_in, check_out, age_band, audience_age_band, properties (name, city, address, lat, lng, country_code, house_notes)",
      )
      .eq("id", guideId)
      .maybeSingle(),
    db.from("guide_sections").select("section, intro, items, qloo_request").eq("guide_id", guideId),
    db.from("heatmaps").select("cells").eq("guide_id", guideId).maybeSingle(),
    db
      .from("quiz_answers")
      .select("artist_names, media_names, tag_labels, dietary")
      .eq("guide_id", guideId)
      .maybeSingle(),
  ]);
  for (const result of [guide, sections, heatmap, quiz]) {
    if (result.error) throw new Error(`guide view load failed: ${result.error.message}`);
  }
  const row = guide.data;
  if (!row?.properties) return null;
  const p = row.properties;

  const bySection = new Map((sections.data ?? []).map((s) => [s.section, s]));
  const q = quiz.data;
  return {
    heroLine: row.hero_line,
    checkIn: row.check_in,
    checkOut: row.check_out,
    ageBand: row.age_band,
    audienceAgeBand: row.audience_age_band,
    property: {
      name: p.name,
      city: p.city,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      countryCode: p.country_code,
      houseNotes: p.house_notes,
    },
    signals: q
      ? [
          ...[...q.artist_names, ...q.media_names].map(displayName),
          ...[...q.tag_labels, ...q.dietary].map(labelFromSlug),
        ]
      : [],
    sections: SECTION_KINDS.flatMap((kind) => {
      const stored = bySection.get(kind);
      const items = parseItems(stored?.items);
      if (!stored || !items.length) return [];
      return [
        { section: kind, intro: stored.intro ?? "", items, radiusM: radiusOf(stored.qloo_request) },
      ];
    }),
    heatmap: parseHeatmap(heatmap.data?.cells),
  };
}

/** Records the guest's first open. Later opens leave the timestamp alone. */
export async function markViewed(guideId: string) {
  const { error } = await createServiceClient()
    .from("guides")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", guideId)
    .is("viewed_at", null);
  if (error) console.error(`mark viewed failed: ${error.message}`);
}
