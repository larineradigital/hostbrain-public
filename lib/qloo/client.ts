import "server-only";

import { createHash } from "node:crypto";

import { readServerEnv, type QlooMode } from "@/lib/env";

import { QlooError } from "./errors";
import { guardParams, type QlooParams, type QlooPath } from "./guard";
import { mockQlooResponse } from "./mock";
import { stripAkas } from "./schemas";
import { createDefaultQlooStore, type ApiLogEntry, type QlooStore } from "./store";
import { Throttle } from "./throttle";

/**
 * The only way to call Qloo: at most 4 requests per second and 2 in flight, retries on
 * 429/5xx, a database cache and one log row per call.
 *
 * - live: guarded params → cache → throttled GET with retries → cache write.
 * - mock: synthetic fixtures from tests/fixtures/qloo (no network, no cache).
 * - replay: cached responses only, even if expired; a miss is an error.
 *
 * Every call writes one `api_log` row. Live mode never falls back to fake data.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Cache TTLs per endpoint. */
export const CACHE_TTL_MS: Record<QlooPath, number> = {
  "/search": 24 * HOUR_MS,
  "/v2/tags": 24 * HOUR_MS,
  "/v2/insights": 72 * HOUR_MS,
};

export interface QlooCallContext {
  /** Recorded in `api_log` so a guide's calls can be shown in "How it works". */
  guideId?: string;
  /** Terms that must never reach Qloo, such as the guest's first name. */
  forbiddenTerms?: readonly string[];
  /**
   * Total time for the call, throttle wait and retries included. Each attempt is cut off
   * at what's left, and no retry starts past it, so an optional section can't hold a
   * throttle slot for three full timeouts.
   */
  budgetMs?: number;
}

export interface QlooResult {
  data: unknown;
  cacheHit: boolean;
  mode: QlooMode;
}

export interface QlooClient {
  readonly mode: QlooMode;
  get(path: QlooPath, params: QlooParams, context?: QlooCallContext): Promise<QlooResult>;
}

export interface QlooClientOptions {
  mode: QlooMode;
  baseUrl: string;
  apiKey?: string;
  store: QlooStore;
  fetch?: typeof fetch;
  mock?: (path: QlooPath, params: Record<string, string>) => unknown;
  ratePerSecond?: number;
  burst?: number;
  maxInFlight?: number;
  /** Waits before retry 1 and retry 2 on 429, 5xx or a network error. */
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
  /** Clock for cache expiry and latency. The throttle always uses the real clock. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Stable cache key: endpoint + sorted guarded params, with search text lower-cased. */
export function qlooCacheKey(path: QlooPath, params: Record<string, string>): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => {
      const value =
        key === "query" || key.endsWith(".query") ? params[key].toLowerCase() : params[key];
      return `${key}=${value}`;
    })
    .join("&");
  return `qloo:v1:${path}:${createHash("sha256").update(canonical).digest("hex").slice(0, 40)}`;
}

const headerNumber = (headers: Headers, name: string): number | undefined => {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/** Time until the server's per-second window resets; header is in seconds. */
const resetMs = (headers: Headers | undefined) => {
  const reset = headers ? headerNumber(headers, "x-second-ratelimit-reset") : undefined;
  return reset !== undefined && reset > 0 ? reset * 1000 : 1000;
};

const errorMessage = (body: string) => {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown; errors?: unknown };
    const message = parsed.message ?? parsed.error ?? parsed.errors;
    if (message)
      return (typeof message === "string" ? message : JSON.stringify(message)).slice(0, 300);
  } catch {
    // not JSON
  }
  return body.slice(0, 300);
};

export function createQlooClient(options: QlooClientOptions): QlooClient {
  const {
    mode,
    store,
    apiKey,
    fetch: fetchImpl = fetch,
    mock = mockQlooResponse,
    retryDelaysMs = [500, 1500],
    timeoutMs = 10_000,
    now = Date.now,
    sleep = defaultSleep,
  } = options;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const throttle = new Throttle({
    ratePerSecond: options.ratePerSecond ?? 4,
    burst: options.burst ?? 1,
    maxInFlight: options.maxInFlight ?? 2,
  });

  const safeLog = async (entry: ApiLogEntry) => {
    try {
      await store.log(entry);
    } catch (error) {
      console.warn("[qloo] api_log write failed:", (error as Error).message);
    }
  };

  const readCache = async (key: string) => {
    try {
      return await store.getCache(key);
    } catch (error) {
      if (mode === "replay") throw error;
      console.warn("[qloo] cache read failed:", (error as Error).message);
      return null;
    }
  };

  /** One HTTP attempt, holding a throttle slot until the body is read. */
  const attempt = async (url: string, deadline: number) => {
    const release = await throttle.acquire();
    try {
      const left = deadline - Date.now();
      if (left <= 0) throw new DOMException("The call ran out of time", "TimeoutError");
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { "X-Api-Key": apiKey!, Accept: "application/json" },
        signal: AbortSignal.timeout(Math.min(timeoutMs, left)),
      });
      const body = await response.text();
      const remaining = headerNumber(response.headers, "x-second-ratelimit-remaining");
      if (response.status === 429 || (remaining !== undefined && remaining <= 0)) {
        throttle.pauseFor(resetMs(response.headers));
      }
      return { response, body };
    } finally {
      release();
    }
  };

  const fetchLive = async (path: QlooPath, params: Record<string, string>, budgetMs?: number) => {
    const deadline = budgetMs === undefined ? Infinity : Date.now() + budgetMs;
    const url = `${baseUrl}${path}?${new URLSearchParams(params).toString()}`;
    let monthRemaining: number | undefined;
    const fail = (error: QlooError, attempts: number) => {
      error.attempts = attempts;
      error.monthRemaining = monthRemaining;
      return error;
    };

    for (let attempts = 1; ; attempts++) {
      const canRetry = attempts <= retryDelaysMs.length;
      const backoff = retryDelaysMs[attempts - 1];
      let wait: number;
      let retrying: QlooError;
      try {
        const { response, body } = await attempt(url, deadline);
        const { status } = response;
        monthRemaining =
          headerNumber(response.headers, "x-month-ratelimit-remaining") ?? monthRemaining;
        if (response.ok) {
          try {
            return { data: JSON.parse(body) as unknown, status, attempts, monthRemaining };
          } catch {
            throw new QlooError("schema", `Qloo ${path} returned invalid JSON`, status);
          }
        }
        const error = new QlooError(
          "http",
          `Qloo ${path} returned ${status}: ${errorMessage(body)}`,
          status,
        );
        if (!(status === 429 || status >= 500) || !canRetry) throw error;
        wait = status === 429 ? Math.max(backoff, resetMs(response.headers)) : backoff;
        retrying = error;
      } catch (error) {
        if (error instanceof QlooError) throw fail(error, attempts);
        const network = new QlooError(
          "network",
          `Qloo ${path} network error: ${(error as Error).message}`,
        );
        if (!canRetry) throw fail(network, attempts);
        wait = backoff;
        retrying = network;
      }
      // No retry that couldn't finish within the call's budget.
      if (Date.now() + wait >= deadline) throw fail(retrying, attempts);
      await sleep(wait);
    }
  };

  return {
    mode,
    async get(path, rawParams, context = {}) {
      const params = guardParams(path, rawParams, { forbiddenTerms: context.forbiddenTerms });
      const started = now();
      const base = {
        guideId: context.guideId,
        provider: "qloo" as const,
        endpoint: path,
        params,
        mode,
      };

      if (mode === "mock") {
        const data = mock(path, params);
        await safeLog({
          ...base,
          status: 200,
          latencyMs: now() - started,
          cacheHit: false,
          attempts: 0,
        });
        return { data, cacheHit: false, mode };
      }

      const key = qlooCacheKey(path, params);
      const cached = await readCache(key);
      if (cached && (mode === "replay" || cached.expiresAt.getTime() > now())) {
        await safeLog({
          ...base,
          status: 200,
          latencyMs: now() - started,
          cacheHit: true,
          attempts: 0,
        });
        return { data: cached.response, cacheHit: true, mode };
      }
      if (mode === "replay") {
        const error = `No cached Qloo response for ${path} (replay mode)`;
        await safeLog({
          ...base,
          status: null,
          latencyMs: now() - started,
          cacheHit: false,
          attempts: 0,
          error,
        });
        throw new QlooError("replay_miss", error);
      }
      if (!apiKey) throw new QlooError("config", "QLOO_API_KEY is not set (live mode)");

      try {
        const result = await fetchLive(path, params, context.budgetMs);
        const data = stripAkas(result.data);
        try {
          await store.setCache(key, path, data, new Date(now() + CACHE_TTL_MS[path]));
        } catch (error) {
          console.warn("[qloo] cache write failed:", (error as Error).message);
        }
        await safeLog({
          ...base,
          status: result.status,
          latencyMs: now() - started,
          cacheHit: false,
          attempts: result.attempts,
          monthRemaining: result.monthRemaining,
        });
        return { data, cacheHit: false, mode };
      } catch (error) {
        const failed = error instanceof QlooError ? error : undefined;
        await safeLog({
          ...base,
          status: failed?.status ?? null,
          latencyMs: now() - started,
          cacheHit: false,
          attempts: failed?.attempts || 1,
          monthRemaining: failed?.monthRemaining,
          error: (error as Error).message,
        });
        throw error;
      }
    },
  };
}

let shared: QlooClient | undefined;

/** The process-wide client, so every caller shares one throttle. */
export function getQlooClient(): QlooClient {
  if (!shared) {
    const env = readServerEnv();
    shared = createQlooClient({
      mode: env.QLOO_MODE,
      baseUrl: env.QLOO_BASE_URL,
      apiKey: env.QLOO_API_KEY,
      store: createDefaultQlooStore(env),
    });
  }
  return shared;
}
