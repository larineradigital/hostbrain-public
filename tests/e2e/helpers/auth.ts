import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("e2e needs a local Supabase: run `pnpm db:start` and fill .env.local");
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error("e2e creates and deletes users, so it only runs against a local Supabase");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface TestHost {
  id: string;
  email: string;
  cleanup: () => Promise<void>;
}

/** Creates a throwaway host and signs the page in through the real magic-link route. */
export async function signInAsNewHost(page: Page): Promise<TestHost> {
  const db = admin();
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.user) throw new Error(`generateLink failed: ${error?.message}`);
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    // New users get a sign-up token; `email` verifies both sign-up and magic-link tokens.
    type: "email",
    next: "/host",
  });
  await page.goto(`/auth/confirm?${params}`);
  const id = data.user.id;
  return { id, email, cleanup: async () => void (await db.auth.admin.deleteUser(id)) };
}

/** A Supabase client signed in as a new throwaway host (anon key + session, so RLS applies). */
export async function newHostClient() {
  const db = admin();
  const email = `e2e-rls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.user) throw new Error(`generateLink failed: ${error?.message}`);
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const verified = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  if (verified.error) throw new Error(`verifyOtp failed: ${verified.error.message}`);
  const id = data.user.id;
  return { id, client, cleanup: async () => void (await db.auth.admin.deleteUser(id)) };
}
