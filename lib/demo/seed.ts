import "server-only";

import type { createServiceClient } from "@/lib/db/server";
import { loadComparison, type ComparisonView } from "@/lib/guide/compare";
import { displayName } from "@/lib/guide/format";
import { defaultPipelineDeps, generateGuide } from "@/lib/guide/pipeline";
import { newGuideToken } from "@/lib/guide/token";
import { parseItems } from "@/lib/guide/view";
import type { QlooClient } from "@/lib/qloo/client";
import { searchArtists, searchMedia, searchPlaces } from "@/lib/qloo/endpoints";
import { urnsForLabels } from "@/lib/qloo/tags";

import { DEMO_HOST, type DemoGuestSpec, type DemoPropertySpec } from "./personas";
import { demoStayDates, pickSearchMatch } from "./rules";

/**
 * Steps of `scripts/seed-demo.ts` and `scripts/warm-cache.ts`. Every step looks up what is
 * already there first, so a rerun changes nothing it doesn't have to: no new rows, and no
 * Qloo calls for host picks, taste picks or guides that already exist.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Host picks are searched this close to the property (Q4). */
const PICK_RADIUS_M = 1500;
/**
 * Scripts aren't bound by the route's 60 s, so slow media calls get longer before their
 * section is dropped (live, artists took ~16 s and movies once up to 79 s).
 */
export const SEED_OPTIONAL_BUDGET_MS = 45_000;

export async function ensureDemoHost(db: ServiceClient, email: string) {
  const { data: existing, error } = await db.rpc("demo_host_id", { target_email: email });
  if (error) throw new Error(`demo host lookup failed: ${error.message}`);
  let hostId = existing as string | null;
  const created = !hostId;
  if (!hostId) {
    const { data, error: createError } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: DEMO_HOST.displayName },
    });
    if (createError || !data.user) throw new Error(`createUser failed: ${createError?.message}`);
    hostId = data.user.id;
  }
  const { error: hostError } = await db
    .from("hosts")
    .upsert({ id: hostId, display_name: DEMO_HOST.displayName });
  if (hostError) throw new Error(`hosts upsert failed: ${hostError.message}`);
  return { hostId, created };
}

export async function ensureDemoProperty(
  db: ServiceClient,
  hostId: string,
  spec: DemoPropertySpec,
) {
  const { data: existing, error } = await db
    .from("properties")
    .select("id, self_serve_token")
    .eq("host_id", hostId)
    .eq("demo_key", spec.key)
    .maybeSingle();
  if (error) throw new Error(`property lookup failed: ${error.message}`);
  const fields = {
    host_id: hostId,
    demo_key: spec.key,
    name: spec.name,
    type: spec.type,
    address: spec.address,
    city: spec.city,
    country_code: spec.countryCode,
    lat: spec.lat,
    lng: spec.lng,
    description: spec.description,
    house_notes: spec.houseNotes,
    self_serve_enabled: spec.selfServe,
    // Keep a printed QR code working: the token never changes once made.
    self_serve_token: existing?.self_serve_token ?? (spec.selfServe ? newGuideToken() : null),
  };
  if (existing) {
    const { error: updateError } = await db.from("properties").update(fields).eq("id", existing.id);
    if (updateError) throw new Error(`property update failed: ${updateError.message}`);
    return { id: existing.id, created: false, selfServeToken: fields.self_serve_token };
  }
  const { data, error: insertError } = await db
    .from("properties")
    .insert(fields)
    .select("id")
    .single();
  if (insertError) throw new Error(`property insert failed: ${insertError.message}`);
  return { id: data.id, created: true, selfServeToken: fields.self_serve_token };
}

/**
 * Searches each pick near the property and keeps the top result that isn't taken yet.
 * Skipped when the property already has picks (the host may have edited them).
 */
export async function ensureHostPicks(
  db: ServiceClient,
  propertyId: string,
  spec: DemoPropertySpec,
  qloo: QlooClient,
) {
  const { count, error } = await db
    .from("host_picks")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);
  if (error) throw new Error(`host picks count failed: ${error.message}`);
  if (count) return { resolved: count, searched: 0, names: [] as string[] };

  const near = { lat: spec.lat, lng: spec.lng };
  const results = await Promise.all(
    spec.picks.map((pick) =>
      searchPlaces({ query: pick.query, near, radiusM: PICK_RADIUS_M, take: 3 }, { client: qloo })
        .then((r) => r.items)
        .catch(() => []),
    ),
  );
  const taken = new Set<string>();
  const rows = spec.picks.flatMap((pick, i) => {
    const entity = results[i].find((e) => !taken.has(e.entityId));
    if (!entity) return [];
    taken.add(entity.entityId);
    const address = entity.properties.address;
    return [
      {
        property_id: propertyId,
        qloo_entity_id: entity.entityId,
        name: entity.name,
        address: typeof address === "string" ? address : null,
        note: pick.note,
      },
    ];
  });
  if (rows.length) {
    const { error: insertError } = await db
      .from("host_picks")
      .insert(rows.map((row, position) => ({ ...row, position })));
    if (insertError) throw new Error(`host picks insert failed: ${insertError.message}`);
  }
  return { resolved: rows.length, searched: spec.picks.length, names: rows.map((r) => r.name) };
}

/** The guest's taste picks as Qloo entities (Q1/Q2); a pick that doesn't resolve is left out. */
export async function resolveTaste(spec: DemoGuestSpec, qloo: QlooClient) {
  const [artists, media] = await Promise.all([
    Promise.all(
      spec.artists.map((name) =>
        searchArtists(name, { client: qloo, take: 5 }).then((r) =>
          pickSearchMatch(r.items, name, "urn:entity:artist"),
        ),
      ),
    ),
    Promise.all(
      spec.media.map(({ title, type }) =>
        searchMedia(title, { client: qloo, take: 5 }).then((r) =>
          pickSearchMatch(r.items, title, `urn:entity:${type}`),
        ),
      ),
    ),
  ]);
  const found = <T>(list: (T | null)[]) => list.filter((e): e is T => e !== null);
  return { artists: found(artists), media: found(media) };
}

export async function ensureDemoGuide(
  db: ServiceClient,
  propertyId: string,
  spec: DemoGuestSpec,
  qloo: QlooClient,
  today = new Date(),
) {
  const { data: existing, error } = await db
    .from("guides")
    .select("id, token, status, quiz_answers (guide_id)")
    .eq("property_id", propertyId)
    .eq("demo_key", spec.key)
    .maybeSingle();
  if (error) throw new Error(`guide lookup failed: ${error.message}`);

  let guide = existing && { id: existing.id, token: existing.token, status: existing.status };
  const created = !guide;
  if (!guide) {
    const { checkIn, checkOut } = demoStayDates(today);
    const { data, error: insertError } = await db
      .from("guides")
      .insert({
        property_id: propertyId,
        demo_key: spec.key,
        token: newGuideToken(),
        guest_first_name: spec.firstName,
        party_type: spec.partyType,
        age_band: spec.ageBand,
        check_in: checkIn,
        check_out: checkOut,
        source: spec.source,
      })
      .select("id, token, status")
      .single();
    if (insertError) throw new Error(`guide insert failed: ${insertError.message}`);
    guide = data;
  }

  /** Taste picks resolved now; null when the quiz was already there. */
  let resolved: { artists: number; media: number } | null = null;
  if (!existing?.quiz_answers) {
    const taste = spec.skipped ? { artists: [], media: [] } : await resolveTaste(spec, qloo);
    resolved = { artists: taste.artists.length, media: taste.media.length };
    const { error: quizError } = await db.from("quiz_answers").insert({
      guide_id: guide.id,
      artist_ids: taste.artists.map((e) => e.entityId),
      artist_names: taste.artists.map((e) => displayName(e.name)),
      media_ids: taste.media.map((e) => e.entityId),
      media_names: taste.media.map((e) => displayName(e.name)),
      tag_labels: [...spec.tagLabels],
      tag_urns: urnsForLabels(spec.tagLabels),
      dietary: [...spec.dietary],
      skipped: spec.skipped,
    });
    if (quizError) throw new Error(`quiz insert failed: ${quizError.message}`);
  }
  return { ...guide, created, resolved };
}

/**
 * Runs the real pipeline for a demo guide (throttled by the Qloo client). On a rerun of a
 * ready guide that fails, the guide goes back to ready: its previous sections are untouched,
 * so the demo never breaks because one refresh did.
 */
export async function generateDemoGuide(
  db: ServiceClient,
  guideId: string,
  { wasReady }: { wasReady: boolean },
) {
  const deps = { ...defaultPipelineDeps(), optionalBudgetMs: SEED_OPTIONAL_BUDGET_MS };
  const started = Date.now();
  try {
    const result = await generateGuide(guideId, () => {}, deps);
    return {
      ok: true as const,
      ms: Date.now() - started,
      writer: result.writer,
      sections: Object.fromEntries(result.sections.map((s) => [s.section, s.items.length])),
    };
  } catch (err) {
    if (wasReady) {
      await db.from("guides").update({ status: "ready", generation_error: null }).eq("id", guideId);
    }
    return { ok: false as const, ms: Date.now() - started, error: (err as Error).message };
  }
}

/** The AI-alone comparison, cached in `comparisons`. Needs OPENAI_API_KEY. */
export async function compareDemoGuide(
  db: ServiceClient,
  guideId: string,
): Promise<ComparisonView["state"]> {
  const { data, error } = await db
    .from("guide_sections")
    .select("items")
    .eq("guide_id", guideId)
    .eq("section", "eat")
    .maybeSingle();
  if (error) throw new Error(`eat section load failed: ${error.message}`);
  const view = await loadComparison(guideId, parseItems(data?.items));
  return view.state;
}
