import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Host {
  id: string;
  email: string;
}

/** The signed-in host, or null. Reads the session cookie, so call it behind a Suspense boundary. */
export async function getHost(): Promise<Host | null> {
  // Session checks compare token expiry with the clock, so they must run per request.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}

/** The signed-in host; redirects to /login otherwise. Re-check in every action and route. */
export async function requireHost(next = "/host"): Promise<Host> {
  const host = await getHost();
  if (!host) redirect(`/login?next=${encodeURIComponent(next)}`);
  return host;
}

/** Only allow same-site relative paths as post-login targets. */
export function safeNext(next: string | null | undefined, fallback = "/host") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
