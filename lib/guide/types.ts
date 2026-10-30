import { z } from "zod";

/**
 * Shapes stored in `guide_sections.items` and streamed by the generate route. Shared by
 * the pipeline (server) and the guide and building screens (M3b, M4), so no server imports.
 */

export const SECTION_KINDS = [
  "eat",
  "drink",
  "do",
  "rainy",
  "host_picks",
  "playlist",
  "films",
  "shows",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const PLACE_SECTIONS = ["eat", "drink", "do", "rainy"] as const;
export type PlaceSection = (typeof PLACE_SECTIONS)[number];

export const PARTY_TYPES = ["solo", "couple", "family", "friends", "business"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

/** One of the guest's own picks that Qloo says drove this result, with its score. */
export const explainSchema = z.object({
  entity_id: z.string(),
  name: z.string(),
  score: z.number(),
});

export const guideItemSchema = z.object({
  /** A Qloo entity ID returned by a call made for this guide. */
  entity_id: z.string().min(1),
  name: z.string().min(1),
  /** "Wine bar", "Museum", "Electronic" (from Qloo tags). */
  category: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  distance_m: z.number().nullable(),
  image_url: z.string().nullable(),
  price_level: z.number().int().min(1).max(4).nullable(),
  /** Our explanation, written by the model or from the fallback template. */
  why_you: z.string(),
  /** Names of the guest's signals behind this pick (for "Why this?"). */
  signals_used: z.array(z.string()),
  /** Qloo affinity, 0…1. Close together for places; show rank, not the number. */
  affinity: z.number().nullable(),
  explain: z.array(explainSchema),
  /** Qloo tag names on the entity, for the card and "Why this?". */
  tags: z.array(z.string()),
  /** Movies and shows. */
  year: z.number().int().nullable().optional(),
  /** Host picks only. */
  host_note: z.string().nullable().optional(),
  top_match: z.boolean().optional(),
});
export type GuideItem = z.infer<typeof guideItemSchema>;

export const heatmapCellSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  affinity: z.number(),
});
export type HeatmapCell = z.infer<typeof heatmapCellSchema>;

export const GENERATION_STEPS = [
  "taste",
  "eat",
  "drink",
  "do",
  "rainy",
  "host_picks",
  "playlist",
  "films",
  "heatmap",
  "writing",
  "saving",
] as const;
export type GenerationStep = (typeof GENERATION_STEPS)[number];

/** Server-sent events from `POST /api/guides/[id]/generate`, one JSON object per `data:` line. */
export type GenerationEvent =
  | {
      type: "step";
      step: GenerationStep;
      status: "active" | "done" | "skipped";
      label: string;
      count?: number;
    }
  | { type: "done"; guideId: string; token: string }
  | { type: "error"; message: string };
