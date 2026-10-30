import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readServerEnv } from "@/lib/env";

import type { Database } from "./types";

/**
 * Service-role client: bypasses RLS. Only for guest token routes, pipelines and scripts,
 * always after checking the token or the host's ownership in code.
 */
export function createServiceClient() {
  const env = readServerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
