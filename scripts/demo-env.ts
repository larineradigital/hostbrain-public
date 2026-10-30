/**
 * Shared start-up for the demo and cleanup scripts: loads the env file for
 * `--env local|production` (.env.local, or .env.production.local when it exists, else the
 * variables already set, as on Railway), applies `--mock`, and the scripts refuse a hosted
 * Supabase unless `--env production` was passed. Never prints keys.
 */
import { existsSync } from "node:fs";

import { config } from "dotenv";

import type { createServiceClient } from "@/lib/db/server";

export function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

export function option(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * The env file to load, or null to use only the variables already set. `.env.local` is
 * required. `.env.production.local` is optional: a Railway service (the daily cleanup cron)
 * has its variables set and no file. The hosted-Supabase guard (`assertSeedTarget`) still
 * needs `--env production` either way.
 */
export function envFileFor(envName: "local" | "production", exists: (file: string) => boolean) {
  const file = envName === "production" ? ".env.production.local" : ".env.local";
  if (exists(file)) return file;
  if (envName === "production") return null;
  throw new Error(`${file} not found`);
}

export function loadDemoEnv() {
  const envName = option("env") === "production" ? "production" : "local";
  const file = envFileFor(envName, existsSync);
  // Variables already set in the shell win, so `QLOO_MODE=replay pnpm tsx …` works.
  if (file) config({ path: file, quiet: true });
  if (flag("mock")) {
    process.env.QLOO_MODE = "mock";
    process.env.OPENAI_API_KEY = "";
  }
  return envName;
}

/** Live Qloo traffic since `since`, from `api_log` (counts only). */
export async function qlooUsage(db: ReturnType<typeof createServiceClient>, since: Date) {
  const { data } = await db
    .from("api_log")
    .select("cache_hit, mode, attempts, month_remaining, error")
    .eq("provider", "qloo")
    .gte("created_at", since.toISOString());
  const rows = data ?? [];
  const live = rows.filter((r) => !r.cache_hit && r.mode === "live");
  const remaining = rows
    .map((r) => r.month_remaining)
    .filter((n): n is number => typeof n === "number");
  return {
    calls: rows.length,
    cacheHits: rows.filter((r) => r.cache_hit).length,
    httpRequests: live.reduce((sum, r) => sum + (r.attempts ?? 1), 0),
    errors: rows.filter((r) => r.error).length,
    monthRemaining: remaining.length ? Math.min(...remaining) : null,
  };
}
