import "server-only";

import { z } from "zod";

import { DEMO_HOST } from "@/lib/demo/personas";

const qlooModes = ["live", "mock", "replay"] as const;
export type QlooMode = (typeof qlooModes)[number];

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

/** OpenAI's "near-flagship at a lower cost" model (developers.openai.com/api/docs/models, Oct 2026). */
export const DEFAULT_OPENAI_MODEL = "gpt-6.1-sol";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  QLOO_BASE_URL: z.preprocess(emptyToUndefined, z.url().default("https://hackathon.api.qloo.com")),
  QLOO_API_KEY: optionalString,
  QLOO_MODE: z.preprocess(emptyToUndefined, z.enum(qlooModes).optional()),
  /** Which LLM vendor writes and talks (lib/ai/provider.ts). OpenAI is the only one today. */
  LLM_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["openai"]).default("openai")),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().default(DEFAULT_OPENAI_MODEL)),
  APP_URL: z.preprocess(emptyToUndefined, z.url().default("http://localhost:3000")),
  /** `replay` answers the concierge from a recorded synthetic fixture (e2e, no key). */
  CONCIERGE_MODE: z.preprocess(emptyToUndefined, z.enum(["live", "replay"]).default("live")),
  /** `replay` answers the AI-alone comparison from a recorded synthetic fixture (e2e, no key). */
  COMPARE_MODE: z.preprocess(emptyToUndefined, z.enum(["live", "replay"]).default("live")),
  /** `mock` returns a fixed forecast instead of calling Open-Meteo (e2e, offline). */
  WEATHER_MODE: z.preprocess(emptyToUndefined, z.enum(["live", "mock"]).default("live")),
  /** Public source repository, linked from the landing page footer when set. */
  REPO_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  /** The demo host account (scripts/seed-demo.ts, /demo, the demo login). */
  DEMO_HOST_EMAIL: z.preprocess(emptyToUndefined, z.email().default(DEMO_HOST.defaultEmail)),
  DEMO_MODE: z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  ),
});

export type ServerEnv = Omit<z.infer<typeof serverEnvSchema>, "QLOO_MODE"> & {
  QLOO_MODE: QlooMode;
};

/**
 * Parses server environment variables. Secrets are only readable here and in
 * other `server-only` modules. Without a Qloo key the mode falls back to mock.
 */
export function readServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = serverEnvSchema.parse(source);
  return {
    ...parsed,
    QLOO_MODE: parsed.QLOO_MODE ?? (parsed.QLOO_API_KEY ? "live" : "mock"),
  };
}
