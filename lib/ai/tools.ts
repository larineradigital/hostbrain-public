import "server-only";

import { z } from "zod";

import { distanceM } from "@/lib/geo/distance";
import {
  labelUrns,
  mediaItem,
  placeItem,
  readTaste,
  type ItemContext,
  type Taste,
} from "@/lib/guide/pipeline";
import { familyAllows } from "@/lib/guide/family-filter";
import type { GuideContext } from "@/lib/guide/store";
import { SECTION_KINDS, type GuideItem, type SectionKind } from "@/lib/guide/types";
import type { GuideView } from "@/lib/guide/view";
import type { QlooClient } from "@/lib/qloo/client";
import {
  recommendMedia,
  searchTags,
  sectionPlaces,
  type EndpointOptions,
  type MediaType,
} from "@/lib/qloo/endpoints";
import { SECTION_TAGS, TAG_MAP, isKnownTagUrn, urnsForLabels } from "@/lib/qloo/tags";
import { getWeather } from "@/lib/weather";

import type { ChatCard, ChatEvent, ConciergeToolName } from "./chat";
import type { AgentTool } from "./provider";

/**
 * The concierge's tools. Every place, artist or film the guest can see
 * comes from a Qloo call made here or from the guide: `show_cards` only accepts entity IDs
 * that are in `session.known`, and the server drops (and logs) any other ID before
 * anything renders. Qloo calls go through lib/qloo/endpoints.ts with the guest's first
 * name as a forbidden term, so no personal data reaches Qloo.
 */

export const PLACE_CATEGORIES = [
  "eat",
  "drink",
  "do",
  "indoor",
  "family",
  "late_night",
  "coffee",
  "outdoors",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/** Card colour and icon for each category. */
const CATEGORY_SECTION: Record<PlaceCategory, SectionKind> = {
  eat: "eat",
  drink: "drink",
  coffee: "drink",
  late_night: "drink",
  do: "do",
  family: "do",
  outdoors: "do",
  indoor: "rainy",
};

const MEDIA_SECTION: Record<MediaType, SectionKind> = {
  artist: "playlist",
  movie: "films",
  tv_show: "shows",
};

/** Price words → Qloo price levels (1–4). "mid" means "not too pricey". */
const PRICE_LEVELS = {
  low: { max: 1 },
  mid: { max: 2 },
  high: { min: 3 },
} as const;

export const REASON_MAX = 110;
const DEFAULT_RADIUS_M = 2000;

/** What one concierge turn knows about the stay, loaded once per request. */
export interface ConciergeData {
  guideId: string;
  /** Quiz IDs, party type, property point. `guestFirstName` is only a forbidden term. */
  context: GuideContext;
  /** The guide as the guest sees it: sections, dates, house notes. */
  guide: GuideView;
}

export interface ToolSession {
  data: ConciergeData;
  qloo?: QlooClient;
  /** Entity ID → card, for everything the guest may be shown: the guide and every tool result. */
  known: Map<string, ChatCard>;
  /** Cards for the entities tools returned in this turn (stored so later turns may show them). */
  found: ChatCard[];
  /** Cards `show_cards` accepted in this turn. */
  shown: ChatCard[];
  /** IDs `show_cards` rejected in this turn. */
  dropped: string[];
  /** Tag URNs returned by `search_tags` in this turn. */
  tagIds: Set<string>;
  calls: ConciergeToolName[];
  emit: (event: ChatEvent) => void;
  now: () => number;
}

/** The guide's own items as cards, with their rank in their section. */
export function guideCards(guide: GuideView): ChatCard[] {
  return guide.sections.flatMap((section) =>
    section.items.map((item, i) => ({
      section: section.section,
      item,
      rank: i + 1,
      total: section.items.length,
      radiusM: section.radiusM,
    })),
  );
}

export function createToolSession(
  data: ConciergeData,
  options: {
    /** Cards for entities that tools returned in earlier turns of this conversation. */
    previous?: readonly ChatCard[];
    emit?: (event: ChatEvent) => void;
    qloo?: QlooClient;
    now?: () => number;
  } = {},
): ToolSession {
  const known = new Map<string, ChatCard>();
  for (const card of [...guideCards(data.guide), ...(options.previous ?? [])]) {
    if (!known.has(card.item.entity_id)) known.set(card.item.entity_id, card);
  }
  return {
    data,
    qloo: options.qloo,
    known,
    found: [],
    shown: [],
    dropped: [],
    tagIds: new Set(),
    calls: [],
    emit: options.emit ?? (() => {}),
    now: options.now ?? Date.now,
  };
}

const EMOJI = /\p{Extended_Pictographic}/gu;

/** One short line, no emojis, at most REASON_MAX characters (cut at a word). */
export function cleanReason(text: string): string {
  const line = text.replace(EMOJI, "").replace(/\s+/g, " ").trim();
  if (line.length <= REASON_MAX) return line;
  const cut = line.slice(0, REASON_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 60)).trimEnd()}…`;
}

/**
 * The `show_cards` guard: keeps only IDs the guest may be shown (`known`), once each,
 * and puts the concierge's reason on the card. Everything else is dropped. Pure.
 */
export function validateCards(
  requested: ReadonlyArray<{ entity_id: string; reason: string }>,
  known: ReadonlyMap<string, ChatCard>,
  alreadyShown: ReadonlySet<string> = new Set(),
): { cards: ChatCard[]; dropped: string[] } {
  const cards: ChatCard[] = [];
  const dropped: string[] = [];
  const taken = new Set(alreadyShown);
  for (const { entity_id, reason } of requested) {
    const card = known.get(entity_id);
    if (!card) {
      dropped.push(entity_id);
      continue;
    }
    if (taken.has(entity_id)) continue;
    taken.add(entity_id);
    const why = cleanReason(reason) || card.item.why_you;
    cards.push({ ...card, item: { ...card.item, why_you: why } });
  }
  return { cards, dropped };
}

// ---------------------------------------------------------------------------------------
// Schemas. Strict function tools take a subset of JSON Schema: every field is
// required (optional ones are nullable) and strings take no length bounds. `strictSchema`
// moves those bounds into the description for the model; zod still enforces every bound
// when the loop parses the arguments, and a bad input goes back to the model as an error
// result it can fix.

type JsonSchema = { [key: string]: unknown };
const UNSUPPORTED = ["minLength", "maxLength"] as const;

function stripBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripBounds);
  if (!node || typeof node !== "object") return node;
  const out: JsonSchema = {};
  const notes: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if ((UNSUPPORTED as readonly string[]).includes(key)) notes.push(`${key}: ${value}`);
    else if (key !== "$schema") out[key] = stripBounds(value);
  }
  if (notes.length) {
    const description = typeof out.description === "string" ? `${out.description} ` : "";
    out.description = `${description}(${notes.join(", ")})`;
  }
  return out;
}

/** JSON Schema for a strict function tool, from the zod schema the loop validates with. */
export function strictSchema(schema: z.ZodObject) {
  return stripBounds(z.toJSONSchema(schema, { reused: "inline" })) as {
    type: "object";
    [key: string]: unknown;
  };
}

function strictTool<S extends z.ZodObject>(options: {
  name: ConciergeToolName;
  description: string;
  inputSchema: S;
  run: (input: z.infer<S>) => Promise<string>;
}): AgentTool<S> {
  return {
    name: options.name,
    description: options.description,
    schema: options.inputSchema,
    parameters: strictSchema(options.inputSchema),
    run: options.run,
  };
}

export const recommendPlacesInput = z.object({
  category: z
    .enum(PLACE_CATEGORIES)
    .describe(
      "Kind of place. indoor = museums, galleries, cinemas; family = family-friendly places; late_night = bars, clubs and live music.",
    ),
  extra_tags: z
    .array(z.string())
    .max(4)
    .nullable()
    .describe(
      "Optional taste tags to lean towards: chip labels such as romantic, cosy, live_music, vegetarian_food, or tag IDs returned by search_tags.",
    ),
  radius_m: z
    .number()
    .int()
    .min(500)
    .max(5000)
    .nullable()
    .describe("Search radius around the stay in metres, 500 to 5000. null = 2000."),
  price: z
    .enum(["low", "mid", "high"])
    .nullable()
    .describe("Price range. mid = not too pricey. null = any."),
  count: z.number().int().min(1).max(6).describe("How many places to return, 1 to 6."),
});

export const recommendMediaInput = z.object({
  type: z.enum(["artist", "movie", "tv_show"]),
  count: z.number().int().min(1).max(6).describe("How many to return, 1 to 6."),
  mood_tags: z
    .array(z.string())
    .max(3)
    .nullable()
    .describe("Optional tag IDs returned by search_tags, such as a genre."),
});

export const searchTagsInput = z.object({
  query: z
    .string()
    .min(2)
    .max(40)
    .describe('One or two words, such as "ramen", "jazz" or "night club". Never a person\'s name.'),
});

export const getWeatherInput = z.object({ date: z.enum(["today", "tomorrow"]) });

export const getGuideItemsInput = z.object({ section: z.enum(SECTION_KINDS) });

export const showCardsInput = z.object({
  items: z
    .array(
      z.object({
        entity_id: z
          .string()
          .min(1)
          .describe("An entity_id from a tool result in this conversation or from the guide."),
        reason: z
          .string()
          .min(1)
          .max(200)
          .describe(
            `Why it fits, in at most ${REASON_MAX} characters, tied to the guest's taste signals ("Popular with people who love …").`,
          ),
      }),
    )
    .min(1)
    .max(6),
});

// ---------------------------------------------------------------------------------------

const errorText = (error: unknown) =>
  `Qloo didn't answer (${error instanceof Error ? error.name : "error"}). Try once more, or use get_guide_items.`;

function endpointOptions(session: ToolSession): EndpointOptions {
  const name = session.data.context.guide.guestFirstName;
  return {
    guideId: session.data.guideId,
    forbiddenTerms: name ? [name] : [],
    ...(session.qloo ? { client: session.qloo } : {}),
  };
}

function remember(session: ToolSession, cards: ChatCard[]) {
  for (const card of cards) {
    session.known.set(card.item.entity_id, card);
    session.found.push(card);
  }
}

/** What the model sees about an item: enough to choose and explain, nothing to invent from. */
function summary(item: GuideItem) {
  return {
    entity_id: item.entity_id,
    name: item.name,
    category: item.category,
    ...(item.distance_m === null ? {} : { distance_m: item.distance_m }),
    ...(item.price_level === null ? {} : { price_level: item.price_level }),
    ...(item.year ? { year: item.year } : {}),
    qloo_tags: item.tags.slice(0, 6),
    driven_by: item.explain.slice(0, 2).map((e) => e.name),
    matched_tags: item.signals_used.filter((s) => !item.explain.some((e) => e.name === s)),
  };
}

/** Extra tags → URNs: chip labels from our map, or tag IDs search_tags returned. */
function extraTagUrns(tags: readonly string[], session: ToolSession) {
  return tags.flatMap((tag) => {
    if (session.tagIds.has(tag) || isKnownTagUrn(tag)) return [tag];
    const entry = TAG_MAP.find(
      (e) => e.label === tag || e.display.toLowerCase() === tag.toLowerCase(),
    );
    return entry ? [...entry.urns] : [];
  });
}

function itemContext(session: ToolSession, taste: Taste): ItemContext {
  const { context } = session.data;
  const quiz = context.quiz?.skipped ? null : context.quiz;
  return {
    taste,
    near: { lat: context.property.lat, lng: context.property.lng },
    labels: labelUrns(quiz?.tagLabels ?? []),
  };
}

export async function recommendPlaces(
  session: ToolSession,
  input: z.infer<typeof recommendPlacesInput>,
): Promise<string> {
  const { context } = session.data;
  const taste = readTaste(context);
  const ctx = itemContext(session, taste);
  const radiusM = input.radius_m ?? DEFAULT_RADIUS_M;
  const filterTags =
    input.category === "drink" && taste.family
      ? SECTION_TAGS.drink_family
      : SECTION_TAGS[input.category];
  const quiz = context.quiz?.skipped ? null : context.quiz;
  const tags = [...(taste.signals.tagUrns ?? []), ...extraTagUrns(input.extra_tags ?? [], session)];
  if (input.category === "eat") tags.push(...urnsForLabels(quiz?.dietary ?? []));
  if (taste.family) tags.push(...SECTION_TAGS.family);

  try {
    const result = await sectionPlaces(
      {
        near: ctx.near,
        radiusM,
        filterTags,
        signals: { ...taste.signals, tagUrns: [...new Set(tags)] },
        priceLevel: input.price ? PRICE_LEVELS[input.price] : undefined,
        take: 20,
      },
      endpointOptions(session),
    );
    const places = result.items
      .filter((entity) => !entity.properties.is_closed)
      // Families get no bars or alcohol places outside Eat (lib/guide/family-filter.ts), also when they ask for
      // late-night plans.
      .filter((entity) => familyAllows(entity, { family: taste.family, section: input.category }))
      .filter((entity) => {
        if (!entity.location) return true;
        const d = distanceM(ctx.near, { lat: entity.location.lat, lng: entity.location.lon });
        return d <= radiusM * 1.05;
      })
      .slice(0, input.count)
      .map((entity) => placeItem(entity, ctx, filterTags));
    const section = CATEGORY_SECTION[input.category];
    remember(
      session,
      places.map((item, i) => ({ section, item, rank: i + 1, total: places.length, radiusM })),
    );
    if (!places.length) {
      return JSON.stringify({
        places: [],
        note: "Nothing matched. Try a wider radius, no price filter, or another category.",
      });
    }
    return JSON.stringify({ radius_m: radiusM, places: places.map(summary) });
  } catch (error) {
    throw new Error(errorText(error));
  }
}

export async function recommendMediaTool(
  session: ToolSession,
  input: z.infer<typeof recommendMediaInput>,
): Promise<string> {
  const taste = readTaste(session.data.context);
  const ctx = itemContext(session, taste);
  const moodTags = (input.mood_tags ?? []).filter(
    (tag) => session.tagIds.has(tag) || isKnownTagUrn(tag),
  );
  try {
    const result = await recommendMedia(
      input.type,
      {
        entityIds: taste.signals.entityIds,
        ageBand: taste.signals.ageBand,
        ...(moodTags.length ? { tagUrns: moodTags } : {}),
      },
      { ...endpointOptions(session), take: Math.min(20, input.count + 6) },
    );
    const items = result.items
      .filter((entity) => !taste.inputIds.has(entity.entityId))
      .slice(0, input.count)
      .map((entity) => mediaItem(entity, ctx));
    const section = MEDIA_SECTION[input.type];
    remember(
      session,
      items.map((item, i) => ({ section, item, rank: i + 1, total: items.length, radiusM: null })),
    );
    return JSON.stringify({ [input.type === "artist" ? "artists" : "titles"]: items.map(summary) });
  } catch (error) {
    throw new Error(errorText(error));
  }
}

export async function searchTagsTool(
  session: ToolSession,
  input: z.infer<typeof searchTagsInput>,
): Promise<string> {
  try {
    const result = await searchTags(input.query, { ...endpointOptions(session), take: 8 });
    for (const tag of result.items) session.tagIds.add(tag.id);
    return JSON.stringify({
      tags: result.items.map((tag) => ({ id: tag.id, name: tag.name, type: tag.type })),
    });
  } catch (error) {
    throw new Error(errorText(error));
  }
}

export async function getWeatherTool(
  session: ToolSession,
  input: z.infer<typeof getWeatherInput>,
): Promise<string> {
  const { property } = session.data.context;
  const report = await getWeather({ lat: property.lat, lng: property.lng }, session.now());
  if (!report) return JSON.stringify({ error: "The forecast is unavailable right now." });
  const day = report.days[input.date === "today" ? 0 : 1];
  return JSON.stringify({
    date: input.date,
    ...(input.date === "today" ? { now: report.now } : {}),
    ...(day ? { forecast: day } : { forecast: null }),
  });
}

export function getGuideItemsTool(
  session: ToolSession,
  input: z.infer<typeof getGuideItemsInput>,
): string {
  const section = session.data.guide.sections.find((s) => s.section === input.section);
  if (!section) return JSON.stringify({ section: input.section, items: [] });
  return JSON.stringify({
    section: input.section,
    items: section.items.map((item) => ({ ...summary(item), why_you: item.why_you })),
  });
}

export function showCardsTool(session: ToolSession, input: z.infer<typeof showCardsInput>): string {
  const shownIds = new Set(session.shown.map((card) => card.item.entity_id));
  const { cards, dropped } = validateCards(input.items, session.known, shownIds);
  session.dropped.push(...dropped);
  if (dropped.length) console.warn("concierge show_cards dropped unknown IDs", dropped);
  if (cards.length) {
    session.shown.push(...cards);
    session.emit({ type: "cards", cards });
  }
  return JSON.stringify({
    shown: cards.map((card) => card.item.entity_id),
    ...(dropped.length
      ? {
          not_shown: dropped,
          note: "These IDs did not come from a tool result or the guide, so they were not shown. Never mention them.",
        }
      : {}),
  });
}

/** The six tools, bound to one turn's session. Order is fixed so the prompt cache holds. */
export function conciergeTools(session: ToolSession): AgentTool[] {
  const track =
    <I, R>(name: ConciergeToolName, run: (input: I) => R) =>
    (input: I) => {
      session.calls.push(name);
      session.emit({ type: "status", tool: name });
      return run(input);
    };
  return [
    strictTool({
      name: "recommend_places",
      description:
        "Places near the guest's stay, ranked by Qloo for this guest's taste signals (always applied). Use it for any place to eat, drink, see or do. Returns entity IDs, names, distances, Qloo tags and which of the guest's signals drove each pick.",
      inputSchema: recommendPlacesInput,
      run: track("recommend_places", (input) => recommendPlaces(session, input)),
    }),
    strictTool({
      name: "recommend_media",
      description:
        "Artists, films or TV shows ranked by Qloo for this guest's taste signals. Returns entity IDs, names and which signals drove each pick.",
      inputSchema: recommendMediaInput,
      run: track("recommend_media", (input) => recommendMediaTool(session, input)),
    }),
    strictTool({
      name: "search_tags",
      description:
        'Finds Qloo tag IDs for a word, such as "ramen", "jazz" or "night club", to pass to recommend_places as extra_tags or to recommend_media as mood_tags.',
      inputSchema: searchTagsInput,
      run: track("search_tags", (input) => searchTagsTool(session, input)),
    }),
    strictTool({
      name: "get_weather",
      description: "Today's or tomorrow's weather at the stay.",
      inputSchema: getWeatherInput,
      run: track("get_weather", (input) => getWeatherTool(session, input)),
    }),
    strictTool({
      name: "get_guide_items",
      description:
        "The places, artists or films already in this guest's guide for one section, with their entity IDs. No new Qloo call.",
      inputSchema: getGuideItemsInput,
      run: track("get_guide_items", async (input) => getGuideItemsTool(session, input)),
    }),
    strictTool({
      name: "show_cards",
      description:
        "Shows recommendation cards in the chat, with an Open in Maps link and a Why this? panel. The only way to recommend anything: pass entity IDs from tool results in this conversation or from the guide, each with a short reason. Other IDs are rejected.",
      inputSchema: showCardsInput,
      run: track("show_cards", async (input) => showCardsTool(session, input)),
    }),
  ];
}
