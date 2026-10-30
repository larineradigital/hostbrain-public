import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { QlooMode, ServerEnv } from "@/lib/env";

/**
 * Where the Qloo client keeps its cache and call log. Production uses the
 * server-only `qloo_cache` and `api_log` tables (service role, RLS with no policies);
 * tests and keyless local runs use the in-memory store.
 */
export interface CachedResponse {
  response: unknown;
  expiresAt: Date;
}

export interface ApiLogEntry {
  guideId?: string;
  provider: "qloo";
  endpoint: string;
  /** Guarded params only; the key is sent as a header and never logged. */
  params: Record<string, string>;
  status: number | null;
  latencyMs: number;
  cacheHit: boolean;
  mode: QlooMode;
  attempts: number;
  monthRemaining?: number;
  error?: string;
}

export interface QlooStore {
  getCache(key: string): Promise<CachedResponse | null>;
  setCache(key: string, endpoint: string, response: unknown, expiresAt: Date): Promise<void>;
  log(entry: ApiLogEntry): Promise<void>;
}

export interface MemoryQlooStore extends QlooStore {
  readonly cache: Map<string, CachedResponse & { endpoint: string }>;
  readonly logs: ApiLogEntry[];
}

const MAX_MEMORY_LOGS = 500;

export function createMemoryQlooStore(): MemoryQlooStore {
  const cache = new Map<string, CachedResponse & { endpoint: string }>();
  const logs: ApiLogEntry[] = [];
  return {
    cache,
    logs,
    async getCache(key) {
      return cache.get(key) ?? null;
    },
    async setCache(key, endpoint, response, expiresAt) {
      cache.set(key, { endpoint, response, expiresAt });
    },
    async log(entry) {
      logs.push(entry);
      if (logs.length > MAX_MEMORY_LOGS) logs.shift();
    },
  };
}

export function createSupabaseQlooStore(db: SupabaseClient): QlooStore {
  return {
    async getCache(key) {
      const { data, error } = await db
        .from("qloo_cache")
        .select("response, expires_at")
        .eq("key", key)
        .maybeSingle();
      if (error) throw new Error(`qloo_cache read failed: ${error.message}`);
      return data ? { response: data.response, expiresAt: new Date(data.expires_at) } : null;
    },
    async setCache(key, endpoint, response, expiresAt) {
      const { error } = await db
        .from("qloo_cache")
        .upsert({ key, endpoint, response, expires_at: expiresAt.toISOString() });
      if (error) throw new Error(`qloo_cache write failed: ${error.message}`);
    },
    async log(entry) {
      const { error } = await db.from("api_log").insert({
        guide_id: entry.guideId ?? null,
        provider: entry.provider,
        endpoint: entry.endpoint,
        params: entry.params,
        status: entry.status,
        latency_ms: entry.latencyMs,
        cache_hit: entry.cacheHit,
        mode: entry.mode,
        attempts: entry.attempts,
        month_remaining: entry.monthRemaining ?? null,
        error: entry.error ?? null,
      });
      if (error) throw new Error(`api_log insert failed: ${error.message}`);
    },
  };
}

/** Service-role store when Supabase is configured, otherwise a process-wide memory store. */
export function createDefaultQlooStore(env: ServerEnv): QlooStore {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return createSupabaseQlooStore(db);
  }
  return createMemoryQlooStore();
}
