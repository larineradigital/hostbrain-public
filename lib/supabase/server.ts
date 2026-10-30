import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/db/types";

import { supabasePublicConfig } from "./config";

/**
 * Supabase client acting as the signed-in host (anon key + session cookie), so every
 * query is limited by row-level security. Use in Server Components, actions and routes.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = supabasePublicConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes them.
        }
      },
    },
  });
}
