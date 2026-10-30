"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";

import { supabasePublicConfig } from "./config";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = supabasePublicConfig();
  return createBrowserClient<Database>(url, anonKey);
}
