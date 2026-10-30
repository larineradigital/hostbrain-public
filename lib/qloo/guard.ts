import "server-only";

/**
 * Parameter allow-list for every Qloo call (Qloo's safe-use rules: no personal data).
 *
 * Only entity IDs, tag URNs, entity types, an age band, the property's fixed location
 * and short search text may reach Qloo. Anything else is rejected before a request is made:
 * unknown parameter names, emails, long free text, phone or booking numbers, and any
 * term the caller marks as forbidden (the guest's first name).
 */

export type QlooPath = "/search" | "/v2/tags" | "/v2/insights";

export type QlooParamValue = string | number | boolean | readonly string[];
export type QlooParams = Record<string, QlooParamValue | undefined>;

export class QlooGuardError extends Error {
  constructor(
    readonly param: string,
    readonly reason: string,
  ) {
    super(`Qloo parameter "${param}" rejected: ${reason}`);
    this.name = "QlooGuardError";
  }
}

/** Age bands the API accepts (confirmed live). */
export const AGE_BANDS = [
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_and_younger",
  "35_to_44",
  "36_to_55",
  "45_to_54",
  "55_and_older",
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Free text longer than this is rejected, except `/search` queries. */
export const MAX_FREE_TEXT = 40;
export const MAX_SEARCH_QUERY = 80;
const MAX_LIST = 50;

const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TAG_URN = /^urn:tag:[a-z_]+(?::[A-Za-z0-9_.-]+)+$/;
const ENTITY_TYPE = /^urn:(?:entity:[a-z_]+|heatmap|demographics)$/;
const WKT_POINT = /^POINT\((-?\d{1,3}(?:\.\d+)?) (-?\d{1,2}(?:\.\d+)?)\)$/;
const LAT_LON = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/;

type Check = (name: string, value: QlooParamValue) => string;

const asString = (name: string, value: QlooParamValue): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new QlooGuardError(name, "expected a single value");
};

const freeText =
  (maxLength: number): Check =>
  (name, value) => {
    const text = asString(name, value).replace(/\s+/g, " ");
    if (!text) throw new QlooGuardError(name, "empty text");
    if (text.length > maxLength) throw new QlooGuardError(name, `text longer than ${maxLength}`);
    if (text.includes("@")) throw new QlooGuardError(name, "looks like an email");
    if (/\d{6,}/.test(text.replace(/[\s().+-]/g, "")))
      throw new QlooGuardError(name, "looks like a phone or booking number");
    if (/https?:|www\./i.test(text)) throw new QlooGuardError(name, "looks like a URL");
    if (/[<>{}]/.test(text) || [...text].some((char) => char.charCodeAt(0) < 32))
      throw new QlooGuardError(name, "invalid characters");
    return text;
  };

const list =
  (pattern: RegExp, what: string): Check =>
  (name, value) => {
    const items = (typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [])
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (items.length === 0) throw new QlooGuardError(name, `expected one or more ${what}`);
    if (items.length > MAX_LIST) throw new QlooGuardError(name, `more than ${MAX_LIST} ${what}`);
    for (const item of items) {
      if (!pattern.test(item)) throw new QlooGuardError(name, `not a valid ${what}`);
    }
    // Sorted and deduplicated, so equal requests share one cache key.
    return [...new Set(items)].sort().join(",");
  };

const integer =
  (min: number, max: number): Check =>
  (name, value) => {
    const n = typeof value === "number" ? value : Number(asString(name, value));
    if (!Number.isInteger(n) || n < min || n > max)
      throw new QlooGuardError(name, `expected an integer from ${min} to ${max}`);
    return String(n);
  };

const oneOf =
  (values: readonly string[]): Check =>
  (name, value) => {
    const text = asString(name, value);
    if (!values.includes(text))
      throw new QlooGuardError(name, `expected one of ${values.join(", ")}`);
    return text;
  };

const flag: Check = oneOf(["true", "false"]);

const wktPoint: Check = (name, value) => {
  const match = WKT_POINT.exec(asString(name, value));
  if (!match || Math.abs(Number(match[1])) > 180 || Math.abs(Number(match[2])) > 90)
    throw new QlooGuardError(name, "expected POINT(lng lat)");
  return match[0];
};

const latLon: Check = (name, value) => {
  const match = LAT_LON.exec(asString(name, value));
  if (!match || Math.abs(Number(match[1])) > 90 || Math.abs(Number(match[2])) > 180)
    throw new QlooGuardError(name, "expected lat,lon");
  return match[0];
};

const entityIds = list(ENTITY_ID, "entity ID");
const tagUrns = list(TAG_URN, "tag URN");
const entityTypes = list(ENTITY_TYPE, "entity type");
const take = integer(1, 50);
const page = integer(1, 20);

const ALLOW_LIST: Record<QlooPath, Record<string, Check>> = {
  "/search": {
    query: freeText(MAX_SEARCH_QUERY),
    types: entityTypes,
    take,
    page,
    "filter.location": latLon,
    // Probably miles; the API rejects values above 100.
    "filter.radius": integer(1, 100),
  },
  "/v2/tags": {
    "filter.query": freeText(MAX_FREE_TEXT),
    "filter.tag.types": list(/^urn:tag:[a-z_]+(?::[a-z_]+)*$/, "tag type"),
    "filter.parents.types": entityTypes,
    take,
    page,
  },
  "/v2/insights": {
    "filter.type": oneOf([
      "urn:entity:place",
      "urn:entity:artist",
      "urn:entity:movie",
      "urn:entity:tv_show",
      "urn:heatmap",
      "urn:demographics",
    ]),
    "filter.location": wktPoint,
    // Metres on insights.
    "filter.location.radius": integer(50, 50_000),
    "filter.location.query": freeText(MAX_FREE_TEXT),
    "filter.tags": tagUrns,
    "filter.exclude.tags": tagUrns,
    "filter.results.entities": entityIds,
    "filter.exclude.entities": entityIds,
    "filter.price_level.min": integer(1, 4),
    "filter.price_level.max": integer(1, 4),
    "signal.interests.entities": entityIds,
    "signal.interests.tags": tagUrns,
    "signal.demographics.age": oneOf(AGE_BANDS),
    "signal.location.query": freeText(MAX_FREE_TEXT),
    "feature.explainability": flag,
    take,
    page,
  },
};

export interface GuardOptions {
  /** Terms that must never reach Qloo, such as the guest's first name. */
  forbiddenTerms?: readonly string[];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Validates and normalises params for one Qloo call. Returns string values ready for a
 * query string, with keys sorted. Throws `QlooGuardError` on the first problem.
 */
export function guardParams(
  path: QlooPath,
  params: QlooParams,
  options: GuardOptions = {},
): Record<string, string> {
  const rules = ALLOW_LIST[path];
  if (!rules) throw new QlooGuardError("path", `${path} is not an allowed endpoint`);

  const forbidden = (options.forbiddenTerms ?? [])
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .map((term) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(term)}($|[^\\p{L}])`, "iu"));

  const out: Record<string, string> = {};
  for (const name of Object.keys(params).sort()) {
    const value = params[name];
    if (value === undefined) continue;
    const check = rules[name];
    if (!check) throw new QlooGuardError(name, `not on the allow-list for ${path}`);
    const normalised = check(name, value);
    if (forbidden.some((pattern) => pattern.test(normalised)))
      throw new QlooGuardError(name, "contains a forbidden personal term");
    out[name] = normalised;
  }
  return out;
}

export const isAgeBand = (value: unknown): value is AgeBand =>
  typeof value === "string" && (AGE_BANDS as readonly string[]).includes(value);

export const isTagUrn = (value: unknown): value is string =>
  typeof value === "string" && TAG_URN.test(value);
