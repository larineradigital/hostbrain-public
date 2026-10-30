import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LlmProviderName } from "@/lib/ai/provider";
import type { Database, Json } from "@/lib/db/types";

import { displayName } from "./format";
import type { GuideItem, HeatmapCell, PartyType, SectionKind } from "./types";

/**
 * What the pipeline reads and writes. Production uses Supabase with the service role
 * (the route has already checked the guest token or the host's ownership); tests use
 * an in-memory implementation.
 */

export interface GuideContext {
  guide: {
    id: string;
    token: string;
    status: Database["public"]["Enums"]["guide_status"];
    partyType: PartyType;
    ageBand: string | null;
    /** Only used as a forbidden term for the Qloo guard. Never sent anywhere. */
    guestFirstName: string | null;
  };
  property: {
    id: string;
    name: string;
    type: string;
    address: string;
    city: string;
    lat: number;
    lng: number;
  };
  quiz: {
    artistIds: string[];
    artistNames: string[];
    mediaIds: string[];
    mediaNames: string[];
    tagUrns: string[];
    tagLabels: string[];
    dietary: string[];
    skipped: boolean;
  } | null;
  hostPicks: Array<{ entityId: string; name: string; note: string | null }>;
}

export interface StoredSection {
  section: SectionKind;
  intro: string;
  items: GuideItem[];
  qlooRequest: Record<string, unknown>;
}

export interface GenerationResult {
  heroLine: string;
  sections: StoredSection[];
  heatmap: HeatmapCell[] | null;
  /** Q11: the age band people with the guest's picks skew towards, or null. */
  audienceAgeBand: string | null;
}

export interface LlmLogEntry {
  guideId: string;
  provider: LlmProviderName;
  endpoint: string;
  /** Model, effort and token usage only. Never prompts, outputs or keys. */
  params: Record<string, unknown>;
  status: number | null;
  latencyMs: number;
  error?: string;
}

export interface GuideStore {
  load(guideId: string): Promise<GuideContext | null>;
  /** Marks the guide as generating unless another run started after `staleBefore`. */
  claim(guideId: string, staleBefore: Date): Promise<boolean>;
  saveResult(guideId: string, result: GenerationResult): Promise<void>;
  markFailed(guideId: string, message: string): Promise<void>;
  logLlm(entry: LlmLogEntry): Promise<void>;
}

export function createSupabaseGuideStore(db: SupabaseClient<Database>): GuideStore {
  return {
    async load(guideId) {
      const { data: guide, error } = await db
        .from("guides")
        .select(
          "id, token, status, party_type, age_band, guest_first_name, properties (id, name, type, address, city, lat, lng)",
        )
        .eq("id", guideId)
        .maybeSingle();
      if (error) throw new Error(`guide load failed: ${error.message}`);
      if (!guide?.properties) return null;
      const property = guide.properties;
      const [quiz, picks] = await Promise.all([
        db.from("quiz_answers").select("*").eq("guide_id", guideId).maybeSingle(),
        db
          .from("host_picks")
          .select("qloo_entity_id, name, note")
          .eq("property_id", property.id)
          .order("position"),
      ]);
      if (quiz.error) throw new Error(`quiz load failed: ${quiz.error.message}`);
      if (picks.error) throw new Error(`host picks load failed: ${picks.error.message}`);
      const q = quiz.data;
      return {
        guide: {
          id: guide.id,
          token: guide.token,
          status: guide.status,
          partyType: guide.party_type,
          ageBand: guide.age_band,
          guestFirstName: guide.guest_first_name,
        },
        property: { ...property, type: property.type },
        quiz: q && {
          artistIds: q.artist_ids,
          artistNames: q.artist_names.map(displayName),
          mediaIds: q.media_ids,
          mediaNames: q.media_names.map(displayName),
          tagUrns: q.tag_urns,
          tagLabels: q.tag_labels,
          dietary: q.dietary,
          skipped: q.skipped,
        },
        hostPicks: (picks.data ?? []).map((pick) => ({
          entityId: pick.qloo_entity_id,
          name: pick.name,
          note: pick.note,
        })),
      };
    },

    async claim(guideId, staleBefore) {
      const { data, error } = await db
        .from("guides")
        .update({
          status: "generating",
          generation_started_at: new Date().toISOString(),
          generation_error: null,
        })
        .eq("id", guideId)
        .or(
          `status.neq.generating,generation_started_at.is.null,generation_started_at.lt.${staleBefore.toISOString()}`,
        )
        .select("id");
      if (error) throw new Error(`guide claim failed: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },

    async saveResult(guideId, { heroLine, sections, heatmap, audienceAgeBand }) {
      const now = new Date().toISOString();
      const { error } = await db.from("guide_sections").upsert(
        sections.map((s) => ({
          guide_id: guideId,
          section: s.section,
          intro: s.intro,
          items: s.items as unknown as NonNullable<Json>,
          qloo_request: s.qlooRequest as Json,
          generated_at: now,
        })),
      );
      if (error) throw new Error(`guide_sections write failed: ${error.message}`);
      if (heatmap) {
        const { error: heatError } = await db.from("heatmaps").upsert({
          guide_id: guideId,
          cells: heatmap as unknown as NonNullable<Json>,
          generated_at: now,
        });
        if (heatError) throw new Error(`heatmaps write failed: ${heatError.message}`);
      }
      // Ready last, so a guide never shows as ready with half its sections.
      const { error: guideError } = await db
        .from("guides")
        .update({
          status: "ready",
          hero_line: heroLine,
          audience_age_band: audienceAgeBand,
          generated_at: now,
          generation_error: null,
        })
        .eq("id", guideId);
      if (guideError) throw new Error(`guide update failed: ${guideError.message}`);
    },

    async markFailed(guideId, message) {
      await db
        .from("guides")
        .update({ status: "failed", generation_error: message.slice(0, 500) })
        .eq("id", guideId);
    },

    async logLlm(entry) {
      const { error } = await db.from("api_log").insert({
        guide_id: entry.guideId,
        provider: entry.provider,
        endpoint: entry.endpoint,
        params: entry.params as Json,
        status: entry.status,
        latency_ms: entry.latencyMs,
        cache_hit: false,
        error: entry.error ?? null,
      });
      if (error) throw new Error(`api_log insert failed: ${error.message}`);
    },
  };
}
