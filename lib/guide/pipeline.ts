import "server-only";

import { getLlm } from "@/lib/ai/provider";
import {
  mergeWritings,
  writeSection,
  type SectionWriting,
  type WriterContext,
  type WriterItem,
  type WriterResult,
  type WriterSection,
} from "@/lib/ai/writer";
import { createServiceClient } from "@/lib/db/server";
import { distanceM, type Point } from "@/lib/geo/distance";
import { getQlooClient, type QlooClient } from "@/lib/qloo/client";
import {
  audienceDemographics,
  rankHostPicks,
  recommendMedia,
  sectionPlaces,
  tasteHeatmap,
  type EndpointOptions,
  type MediaType,
  type TasteSignals,
} from "@/lib/qloo/endpoints";
import { AGE_BANDS, type AgeBand, type QlooParams } from "@/lib/qloo/guard";
import type { QlooEntity } from "@/lib/qloo/schemas";
import { SECTION_TAGS, TAG_MAP, urnsForLabels } from "@/lib/qloo/tags";

import { familyAllows } from "./family-filter";
import {
  createSupabaseGuideStore,
  type GuideContext,
  type GuideStore,
  type StoredSection,
} from "./store";
import {
  PLACE_SECTIONS,
  SECTION_KINDS,
  type GenerationEvent,
  type GenerationStep,
  type GuideItem,
  type HeatmapCell,
  type PlaceSection,
  type SectionKind,
} from "./types";

/**
 * Guide generation.
 *
 * Load property and quiz → run every Qloo call for the guide in parallel (the client
 * throttles to 4 per second, 2 in flight) → keep each place in one section, the one where
 * it ranks best → widen 2 → 4 km for sections under their minimum → apply party rules →
 * one writer call per section, started as soon as that section's items are known → store
 * sections, heatmap and audience → mark the guide ready.
 *
 * Every item shown comes from a Qloo response made here; the model only adds text.
 */

export const SECTION_RULES: Record<PlaceSection, { min: number }> = {
  eat: { min: 6 },
  drink: { min: 4 },
  do: { min: 6 },
  rainy: { min: 3 },
};
export const BASE_RADIUS_M = 2000;
export const WIDE_RADIUS_M = 4000;
const MEDIA_COUNTS = { playlist: 15, films: 5, shows: 3 } as const;
const HEATMAP_RADIUS_M = 3000;
const TOP_MATCHES = 3;
/**
 * Optional sections (host picks, media, heatmap, audience) are skipped if their Qloo call
 * isn't back this long after the run started, so one slow call can't hold up the guide
 * (cold target: under 15 s). The client gives the call a little longer
 * (OPTIONAL_CALL_GRACE_MS), so a late answer can still fill the cache for the next run,
 * then aborts it so it can't hold a throttle slot through retries.
 */
export const OPTIONAL_BUDGET_MS = 9_000;
const OPTIONAL_CALL_GRACE_MS = 3_000;
/** The route has 60 s; the writer gets what's left of this, but at least MIN_WRITER_MS. */
const TOTAL_BUDGET_MS = 55_000;
const MIN_WRITER_MS = 10_000;
/** A run that started longer ago than this is treated as dead and may be claimed again. */
export const STALE_RUN_MS = 2 * 60_000;

/** Scarcest first: on equal rank, a place goes to the section with fewer options. */
const SCARCITY: readonly PlaceSection[] = ["rainy", "drink", "eat", "do"];

export class GuideNotFoundError extends Error {
  constructor() {
    super("Guide not found");
    this.name = "GuideNotFoundError";
  }
}

export class GuideBusyError extends Error {
  constructor() {
    super("This guide is already being generated");
    this.name = "GuideBusyError";
  }
}

export type ProgressHandler = (event: GenerationEvent) => void;

export interface PipelineDeps {
  store: GuideStore;
  qloo: QlooClient;
  /** Writes one section's lines; `hero` also asks for the hero line. */
  writer: (
    context: WriterContext,
    section: WriterSection,
    guideId: string,
    limits: { timeoutMs: number; hero: boolean },
  ) => Promise<SectionWriting>;
  now?: () => number;
  /** Override OPTIONAL_BUDGET_MS (tests). */
  optionalBudgetMs?: number;
}

export function defaultPipelineDeps(): PipelineDeps {
  const store = createSupabaseGuideStore(createServiceClient());
  return {
    store,
    qloo: getQlooClient(),
    writer: async (context, section, guideId, { timeoutMs, hero }) =>
      writeSection(context, section, {
        llm: await getLlm("writer"),
        guideId,
        timeoutMs,
        hero,
        log: (entry) => store.logLlm(entry),
      }),
  };
}

/** Loads the guide and claims it for one run. Throws GuideNotFoundError or GuideBusyError. */
export async function prepareGeneration(
  guideId: string,
  deps: PipelineDeps,
): Promise<GuideContext> {
  const context = await deps.store.load(guideId);
  if (!context) throw new GuideNotFoundError();
  const now = deps.now?.() ?? Date.now();
  if (!(await deps.store.claim(guideId, new Date(now - STALE_RUN_MS)))) throw new GuideBusyError();
  return context;
}

/** `generateGuide(guideId, onProgress)` from the plan: claim, run, store. */
export async function generateGuide(
  guideId: string,
  onProgress: ProgressHandler = () => {},
  deps: PipelineDeps = defaultPipelineDeps(),
) {
  const context = await prepareGeneration(guideId, deps);
  return runGeneration(context, onProgress, deps);
}

// ---------------------------------------------------------------------------------------

export interface Taste {
  signals: TasteSignals;
  /** Entity ID → the name the guest picked, for explainability. */
  names: Map<string, string>;
  inputIds: Set<string>;
  family: boolean;
}

export function readTaste(context: GuideContext): Taste {
  const quiz = context.quiz;
  const family = context.guide.partyType === "family";
  const ids = quiz?.skipped ? [] : [...(quiz?.artistIds ?? []), ...(quiz?.mediaIds ?? [])];
  const names = new Map<string, string>();
  quiz?.artistIds.forEach((id, i) => names.set(id, quiz.artistNames[i] ?? ""));
  quiz?.mediaIds.forEach((id, i) => names.set(id, quiz.mediaNames[i] ?? ""));
  const ageBand = AGE_BANDS.includes(context.guide.ageBand as AgeBand)
    ? (context.guide.ageBand as AgeBand)
    : undefined;
  const tagUrns = quiz?.skipped ? [] : (quiz?.tagUrns ?? []);
  return {
    signals: { entityIds: ids, tagUrns: [...tagUrns], ageBand },
    names,
    inputIds: new Set(ids),
    family,
  };
}

/** Tag URNs for the guest's chip labels, matched by slug or display text. */
export function labelUrns(labels: readonly string[]) {
  return labels.map((label) => {
    const entry = TAG_MAP.find(
      (e) =>
        e.kind !== "section" &&
        (e.label === label || e.display.toLowerCase() === label.toLowerCase()),
    );
    return { label: entry?.display ?? label, urns: new Set(entry?.urns ?? []) };
  });
}

const lastSegment = (urn: string) => urn.split(":").at(-1) ?? urn;
/** A place tag and its genre/category twin count as the same tag. */
const sameTag = (a: string, b: string) =>
  a === b ||
  (/^urn:tag:(genre|category):place:/.test(a) &&
    /^urn:tag:(genre|category):place:/.test(b) &&
    lastSegment(a) === lastSegment(b));

function placeFilterTags(section: PlaceSection, family: boolean) {
  if (section === "drink" && family) return SECTION_TAGS.drink_family;
  return SECTION_TAGS[section];
}

export function placeSignals(
  section: PlaceSection,
  taste: Taste,
  dietaryUrns: string[],
): TasteSignals {
  const tags = [...(taste.signals.tagUrns ?? [])];
  if (section === "eat") tags.push(...dietaryUrns);
  if (taste.family) tags.push(...SECTION_TAGS.family);
  return { ...taste.signals, tagUrns: [...new Set(tags)] };
}

export interface Candidate {
  entity: QlooEntity;
  rank: number;
}

/**
 * Gives each place to one section: candidates are taken in order of rank across all
 * sections (scarcer sections win ties), and a section stops taking once it has its minimum.
 * `reserved` IDs (host picks, places already shown elsewhere) are never assigned.
 */
export function assignPlaces(
  lists: Partial<Record<PlaceSection, Candidate[]>>,
  reserved: ReadonlySet<string> = new Set(),
  existing: Partial<Record<PlaceSection, Candidate[]>> = {},
): Record<PlaceSection, Candidate[]> {
  const result = Object.fromEntries(
    PLACE_SECTIONS.map((s) => [s, [...(existing[s] ?? [])]]),
  ) as Record<PlaceSection, Candidate[]>;
  const taken = new Set([
    ...reserved,
    ...PLACE_SECTIONS.flatMap((s) => result[s].map((c) => c.entity.entityId)),
  ]);
  const queue = PLACE_SECTIONS.flatMap((section) =>
    (lists[section] ?? []).map((candidate) => ({ section, candidate })),
  ).sort(
    (a, b) =>
      a.candidate.rank - b.candidate.rank ||
      SCARCITY.indexOf(a.section) - SCARCITY.indexOf(b.section),
  );
  for (const { section, candidate } of queue) {
    const id = candidate.entity.entityId;
    if (taken.has(id) || result[section].length >= SECTION_RULES[section].min) continue;
    result[section].push(candidate);
    taken.add(id);
  }
  return result;
}

interface PlaceFetch {
  candidates: Candidate[];
  params: QlooParams;
  error?: string;
}

/** Qloo results for one place section, minus closed places, far-off places and (for families) alcohol places. */
async function fetchPlaces(
  section: PlaceSection,
  radiusM: number,
  near: Point,
  signals: TasteSignals,
  family: boolean,
  exclude: string[],
  options: EndpointOptions,
): Promise<PlaceFetch> {
  try {
    const result = await sectionPlaces(
      {
        near,
        radiusM,
        filterTags: placeFilterTags(section, family),
        signals,
        excludeEntityIds: exclude,
        take: 20,
      },
      options,
    );
    const candidates = result.items
      .filter((entity) => !entity.properties.is_closed)
      .filter((entity) => familyAllows(entity, { family, section }))
      .filter((entity) => {
        const d = placeDistance(entity, near);
        return d === null || d <= radiusM * 1.05;
      })
      .map((entity, rank) => ({ entity, rank }));
    return { candidates, params: result.params };
  } catch (error) {
    return { candidates: [], params: {}, error: errorMessage(error) };
  }
}

function placeDistance(entity: QlooEntity, near: Point): number | null {
  if (entity.distanceM !== undefined) return Math.round(entity.distanceM);
  if (!entity.location) return null;
  return Math.round(distanceM(near, { lat: entity.location.lat, lng: entity.location.lon }));
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface ItemContext {
  taste: Taste;
  near: Point;
  labels: ReturnType<typeof labelUrns>;
}

function explainFor(entity: QlooEntity, taste: Taste) {
  return entity.explainability
    .filter((e) => taste.names.get(e.entityId))
    .sort((a, b) => b.score - a.score)
    .map((e) => ({ entity_id: e.entityId, name: taste.names.get(e.entityId)!, score: e.score }));
}

function tagNames(entity: QlooEntity) {
  const seen = new Set<string>();
  return entity.tags
    .map((tag) => tag.name.trim())
    .filter((name) => name && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))
    .slice(0, 8);
}

function placeCategory(entity: QlooEntity, filterTags: readonly string[]) {
  const placeTags = entity.tags.filter((t) => /^urn:tag:(genre|category):place:/.test(t.id));
  const match = placeTags.find((t) => filterTags.some((f) => sameTag(f, t.id)));
  return (match ?? placeTags[0])?.name || null;
}

function mediaCategory(entity: QlooEntity) {
  return entity.tags.find((t) => t.type?.includes("genre"))?.name || null;
}

function baseItem(entity: QlooEntity, ctx: ItemContext, category: string | null): GuideItem {
  const explain = explainFor(entity, ctx.taste);
  const matched = ctx.labels
    .filter(({ urns }) => entity.tags.some((t) => [...urns].some((u) => sameTag(u, t.id))))
    .map(({ label }) => label);
  const p = entity.properties;
  return {
    entity_id: entity.entityId,
    name: entity.name,
    category,
    address: p.address ?? null,
    lat: entity.location?.lat ?? null,
    lng: entity.location?.lon ?? null,
    distance_m: null,
    image_url: p.image?.url ?? null,
    price_level: p.price_level ?? null,
    why_you: "",
    signals_used: [...new Set([...explain.slice(0, 2).map((e) => e.name), ...matched])],
    affinity: entity.affinity ?? null,
    explain,
    tags: tagNames(entity),
  };
}

export function placeItem(
  entity: QlooEntity,
  ctx: ItemContext,
  filterTags: readonly string[],
): GuideItem {
  return {
    ...baseItem(entity, ctx, placeCategory(entity, filterTags)),
    distance_m: placeDistance(entity, ctx.near),
  };
}

export function mediaItem(entity: QlooEntity, ctx: ItemContext): GuideItem {
  const year = Number(entity.properties.release_year);
  return {
    ...baseItem(entity, ctx, mediaCategory(entity)),
    year: Number.isInteger(year) && year > 1800 ? year : null,
  };
}

interface BuiltSection {
  section: SectionKind;
  items: GuideItem[];
  request: Record<string, unknown>;
}

/** Runs one generation for a claimed guide. Marks it failed (and rethrows) on error. */
export async function runGeneration(
  context: GuideContext,
  onProgress: ProgressHandler,
  deps: PipelineDeps,
): Promise<{
  guideId: string;
  sections: StoredSection[];
  heroLine: string;
  audienceAgeBand: string | null;
  writer: WriterResult["source"];
}> {
  const guideId = context.guide.id;
  // Nothing after "done" or "error": an optional call that answers late stays quiet.
  let ended = false;
  const emit = (event: GenerationEvent) => {
    if (ended) return;
    if (event.type !== "step") ended = true;
    try {
      onProgress(event);
    } catch {
      // A closed stream must not stop generation.
    }
  };
  const step = (
    s: GenerationStep,
    status: "active" | "done" | "skipped",
    label: string,
    count?: number,
  ) => emit({ type: "step", step: s, status, label, ...(count === undefined ? {} : { count }) });

  const startedAt = Date.now();
  try {
    const { property } = context;
    const near = { lat: property.lat, lng: property.lng };
    const street = property.address.split(",")[0]?.trim().slice(0, 40) || property.city;
    const taste = readTaste(context);
    const dietaryUrns = context.quiz?.skipped ? [] : urnsForLabels(context.quiz?.dietary ?? []);
    const forbiddenTerms = context.guide.guestFirstName ? [context.guide.guestFirstName] : [];
    const options: EndpointOptions = { client: deps.qloo, guideId, forbiddenTerms };
    const ctx: ItemContext = {
      taste,
      near,
      labels: labelUrns(context.quiz?.skipped ? [] : (context.quiz?.tagLabels ?? [])),
    };
    step("taste", "active", "Reading your taste");
    step("taste", "done", "Reading your taste");

    const labels: Record<PlaceSection, string> = {
      eat: `Finding restaurants near ${street} that fit you`,
      drink: taste.family ? "Picking cafés and sweet stops" : "Picking bars and cafés",
      do: "Choosing things to do",
      rainy: "Finding rainy-day plans",
    };
    const hostPickIds = context.hostPicks.map((p) => p.entityId);
    const reserved = new Set(hostPickIds);

    // Everything in parallel; the Qloo client spaces the requests out.
    const placeCalls = Promise.all(
      PLACE_SECTIONS.map(async (section) => {
        step(section, "active", labels[section]);
        const fetched = await fetchPlaces(
          section,
          BASE_RADIUS_M,
          near,
          placeSignals(section, taste, dietaryUrns),
          taste.family,
          [],
          options,
        );
        step(section, "done", labels[section], fetched.candidates.length);
        return [section, fetched] as const;
      }),
    );

    /**
     * Host picks, media, the heatmap and the audience line are optional: each is skipped
     * if its call isn't back within OPTIONAL_BUDGET_MS of the start, so a slow Qloo call
     * can't sink the guide.
     */
    const budgetMs = deps.optionalBudgetMs ?? OPTIONAL_BUDGET_MS;
    const deadline = startedAt + budgetMs;
    const optionalOptions: EndpointOptions = {
      ...options,
      budgetMs: budgetMs + OPTIONAL_CALL_GRACE_MS,
    };
    const inTime = <T>(task: Promise<T>, timedOut: T): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), Math.max(0, deadline - Date.now()));
      });
      return Promise.race([task, late]).finally(() => clearTimeout(timer));
    };
    const optional = <T>(
      s: GenerationStep,
      label: string,
      task: Promise<T>,
      timedOut: T,
      count: (result: T) => number,
    ): Promise<T> => {
      step(s, "active", label);
      return inTime(task, timedOut).then((result) => {
        step(s, "done", label, count(result));
        return result;
      });
    };
    const timedOut = (section: SectionKind): BuiltSection => ({
      section,
      items: [],
      request: { error: "timed out" },
    });

    // Writer: one call per section, started as soon as the section's items are known.
    const writerContext = buildWriterContext(context, taste);
    const writingLabel = "Writing your guide";
    let writingStarted = false;
    const write = (built: BuiltSection, hero = false): Promise<SectionWriting | null> => {
      if (!built.items.length) return Promise.resolve(null);
      if (!writingStarted) {
        writingStarted = true;
        step("writing", "active", writingLabel);
      }
      const timeoutMs = Math.max(MIN_WRITER_MS, TOTAL_BUDGET_MS - (Date.now() - startedAt));
      return deps.writer(writerContext, writerSection(built), guideId, { timeoutMs, hero });
    };
    const written = (built: Promise<BuiltSection>) =>
      built.then(async (section) => ({ section, writing: await write(section) }));

    const hostPicksLabel = "Ranking your host's favourite spots for you";
    const hostPicksCall: Promise<BuiltSection> = hostPickIds.length
      ? optional(
          "host_picks",
          hostPicksLabel,
          rankHostPicks(hostPickIds, taste.signals, optionalOptions).then(
            (result) => {
              const notes = new Map(context.hostPicks.map((p) => [p.entityId, p.note]));
              const items = result.items
                .filter((e) => notes.has(e.entityId))
                .sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))
                .map((entity, i) => ({
                  ...placeItem(entity, ctx, []),
                  host_note: notes.get(entity.entityId) ?? null,
                  top_match: i < TOP_MATCHES,
                }));
              return { section: "host_picks" as const, items, request: result.params };
            },
            (error) => ({
              section: "host_picks" as const,
              items: [],
              request: { error: errorMessage(error) },
            }),
          ),
          timedOut("host_picks"),
          (s) => s.items.length,
        )
      : (step("host_picks", "skipped", hostPicksLabel),
        Promise.resolve({ section: "host_picks" as const, items: [], request: {} }));

    // Films and music follow the guest's picks and age only: food and vibe tags say little
    // about films, and they made live media calls much slower.
    const mediaSignals: TasteSignals = {
      entityIds: taste.signals.entityIds,
      ageBand: taste.signals.ageBand,
    };
    const hasMediaSignals =
      (mediaSignals.entityIds?.length ?? 0) > 0 || mediaSignals.ageBand !== undefined;
    const mediaCall = (
      section: "playlist" | "films" | "shows",
      type: MediaType,
    ): Promise<BuiltSection> =>
      recommendMedia(type, mediaSignals, optionalOptions).then(
        (result) => ({
          section,
          items: result.items
            .filter((e) => !taste.inputIds.has(e.entityId))
            .slice(0, MEDIA_COUNTS[section])
            .map((e) => mediaItem(e, ctx)),
          request: result.params,
        }),
        (error) => ({ section, items: [], request: { error: errorMessage(error) } }),
      );

    const playlistLabel = "Making your playlist";
    const filmsLabel = "Choosing films and shows";
    let mediaCalls: Array<Promise<BuiltSection>>;
    let shelfDone: Promise<void> = Promise.resolve();
    if (hasMediaSignals) {
      const playlist = optional(
        "playlist",
        playlistLabel,
        mediaCall("playlist", "artist"),
        timedOut("playlist"),
        (s) => s.items.length,
      );
      // Films and shows share one step on the building screen but are written on arrival.
      step("films", "active", filmsLabel);
      const shelf = [
        inTime(mediaCall("films", "movie"), timedOut("films")),
        inTime(mediaCall("shows", "tv_show"), timedOut("shows")),
      ];
      shelfDone = Promise.all(shelf).then(([films, shows]) =>
        step("films", "done", filmsLabel, films.items.length + shows.items.length),
      );
      mediaCalls = [playlist, ...shelf];
    } else {
      step("playlist", "skipped", playlistLabel);
      step("films", "skipped", filmsLabel);
      mediaCalls = [];
    }
    const optionalWritten = Promise.all([hostPicksCall, ...mediaCalls].map(written));

    const heatmapLabel = "Mapping your taste";
    const heatmapCall: Promise<HeatmapCell[] | null> =
      taste.signals.entityIds?.length || taste.signals.tagUrns?.length
        ? optional(
            "heatmap",
            heatmapLabel,
            tasteHeatmap(
              { near, radiusM: HEATMAP_RADIUS_M, signals: taste.signals },
              optionalOptions,
            ).then(
              (result) =>
                result.items.map((c) => ({ lat: c.lat, lng: c.lng, affinity: c.affinity })),
              () => null,
            ),
            null,
            (cells) => cells?.length ?? 0,
          )
        : (step("heatmap", "skipped", heatmapLabel), Promise.resolve(null));

    // Q11: the age band people with the same picks skew towards, for the "taste twins" line.
    // Entity IDs only; no step on the building screen, it's one quick call.
    const audienceCall: Promise<string | null> = taste.signals.entityIds?.length
      ? inTime(
          audienceDemographics(taste.signals.entityIds, optionalOptions).then(
            (result) => result.items.topAgeBand,
            () => null,
          ),
          null,
        )
      : Promise.resolve(null);

    const fetched = Object.fromEntries(await placeCalls) as Record<PlaceSection, PlaceFetch>;
    if (PLACE_SECTIONS.every((s) => fetched[s].error)) {
      throw new Error(`Qloo place calls failed: ${fetched.eat.error}`);
    }
    let assigned = assignPlaces(
      Object.fromEntries(PLACE_SECTIONS.map((s) => [s, fetched[s].candidates])),
      reserved,
    );

    // Widen 2 → 4 km for sections still under their minimum, excluding what's already used.
    const radius: Record<PlaceSection, number> = {
      eat: BASE_RADIUS_M,
      drink: BASE_RADIUS_M,
      do: BASE_RADIUS_M,
      rainy: BASE_RADIUS_M,
    };
    const short = PLACE_SECTIONS.filter((s) => assigned[s].length < SECTION_RULES[s].min);
    if (short.length) {
      const used = [
        ...reserved,
        ...PLACE_SECTIONS.flatMap((s) => assigned[s].map((c) => c.entity.entityId)),
      ];
      const wider = await Promise.all(
        short.map(async (section) => {
          const result = await fetchPlaces(
            section,
            WIDE_RADIUS_M,
            near,
            placeSignals(section, taste, dietaryUrns),
            taste.family,
            used.slice(0, 50),
            options,
          );
          if (!result.error) {
            radius[section] = WIDE_RADIUS_M;
            fetched[section] = { ...result, params: result.params };
          }
          return [section, result.candidates] as const;
        }),
      );
      assigned = assignPlaces(Object.fromEntries(wider), reserved, assigned);
    }

    const placeSections: BuiltSection[] = PLACE_SECTIONS.map((section) => ({
      section,
      items: assigned[section].map((c) =>
        placeItem(c.entity, ctx, placeFilterTags(section, taste.family)),
      ),
      request: {
        ...fetched[section].params,
        radius_m: radius[section],
        ...(fetched[section].error ? { error: fetched[section].error } : {}),
      },
    }));
    // The first place section with items also writes the hero line.
    const heroSection = placeSections.find((s) => s.items.length);
    const placeWritten = Promise.all(
      placeSections.map(async (section) => ({
        section,
        writing: await write(section, section === heroSection),
      })),
    );

    const [places, others, heatmap, audienceAgeBand] = await Promise.all([
      placeWritten,
      optionalWritten,
      heatmapCall,
      audienceCall,
      shelfDone,
    ]);
    const done = [...places, ...others];
    if (!writingStarted) step("writing", "active", writingLabel);
    step("writing", "done", writingLabel);

    step("saving", "active", "Putting it together");
    const writings = done.flatMap((d) => (d.writing ? [d.writing] : []));
    const merged = mergeWritings(writerContext, writings);
    const built = new Map(done.map((d) => [d.section.section, d.section]));
    const sections: StoredSection[] = SECTION_KINDS.map((kind) => {
      const section = built.get(kind) ?? { section: kind, items: [], request: {} };
      const lines = merged.lines[kind] ?? {};
      return {
        section: kind,
        intro: section.items.length ? (merged.intros[kind] ?? "") : EMPTY_NOTES[kind],
        items: section.items.map((item) => ({ ...item, why_you: lines[item.entity_id] ?? "" })),
        qlooRequest: section.request,
      };
    });
    await deps.store.saveResult(guideId, {
      heroLine: merged.heroLine,
      sections,
      heatmap,
      audienceAgeBand,
    });
    step("saving", "done", "Putting it together");
    emit({ type: "done", guideId, token: context.guide.token });
    return {
      guideId,
      sections,
      heroLine: merged.heroLine,
      audienceAgeBand,
      writer: merged.source,
    };
  } catch (error) {
    await deps.store.markFailed(guideId, errorMessage(error)).catch(() => {});
    emit({
      type: "error",
      message: "We couldn't finish your guide. Please try again in a moment.",
    });
    throw error;
  }
}

/** Shown (and the section hidden) when nothing fits even at 4 km. */
const EMPTY_NOTES: Record<SectionKind, string> = {
  eat: "Nothing close enough to suggest yet. Ask your concierge for ideas.",
  drink: "Nothing close enough to suggest yet. Ask your concierge for ideas.",
  do: "Nothing close enough to suggest yet. Ask your concierge for ideas.",
  rainy: "Nothing close enough to suggest yet. Ask your concierge for ideas.",
  host_picks: "Your host hasn't added their own picks yet.",
  playlist: "Tell us a few artists you love and we'll build a playlist.",
  films: "Tell us a few films you love and we'll fill your shelf.",
  shows: "Tell us a few shows you love and we'll fill your shelf.",
};

function buildWriterContext(context: GuideContext, taste: Taste): WriterContext {
  const quiz = context.quiz && !context.quiz.skipped ? context.quiz : null;
  return {
    city: context.property.city,
    party_type: context.guide.partyType,
    age_band: taste.signals.ageBand ?? null,
    signals: {
      artists: quiz?.artistNames ?? [],
      media: quiz?.mediaNames ?? [],
      tags: labelUrns(quiz?.tagLabels ?? []).map((l) => l.label),
    },
    dietary: quiz?.dietary ?? [],
  };
}

function writerSection({ section, items }: BuiltSection): WriterSection {
  return {
    section,
    items: items.map((item): WriterItem => ({
      entity_id: item.entity_id,
      name: item.name,
      category: item.category,
      qloo_tags: item.tags,
      ...(item.distance_m === null ? {} : { distance_m: item.distance_m }),
      driven_by: item.explain.slice(0, 2).map((e) => e.name),
      matched_tags: item.signals_used.filter((s) => !item.explain.some((e) => e.name === s)),
      ...(item.year ? { year: item.year } : {}),
      ...(item.host_note ? { host_note: item.host_note } : {}),
    })),
  };
}
