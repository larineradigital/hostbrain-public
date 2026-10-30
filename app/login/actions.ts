"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNext } from "@/lib/auth";
import { copy } from "@/lib/copy";
import { createServiceClient } from "@/lib/db/server";
import { getDemoHostId } from "@/lib/demo/data";
import { readServerEnv } from "@/lib/env";
import { publicOrigin } from "@/lib/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

const emailSchema = z.email().max(254);

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Please enter a valid email address." };

  const next = safeNext(String(formData.get("next") ?? ""));
  const origin = publicOrigin(await headers());
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    return { status: "error", message: "We couldn't send the link. Please try again in a minute." };
  }
  return { status: "sent", email: parsed.data };
}

export type DemoLoginState = { status: "idle" } | { status: "error"; message: string };

/**
 * DEMO_MODE only: signs in as the demo host without an email. The server makes a one-time
 * sign-in token with the service role and redeems it right away, so the session cookie is
 * set here and no link ever leaves the server.
 */
export async function signInAsDemoHost(
  _prev: DemoLoginState,
  formData: FormData,
): Promise<DemoLoginState> {
  const t = copy.login;
  const env = readServerEnv();
  if (!env.DEMO_MODE) return { status: "error", message: t.demoError };

  const admin = createServiceClient();
  if (!(await getDemoHostId(admin))) return { status: "error", message: t.demoMissing };
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: env.DEMO_HOST_EMAIL,
  });
  if (error || !data.properties?.hashed_token) return { status: "error", message: t.demoError };

  const supabase = await createSupabaseServerClient();
  const verified = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  if (verified.error) return { status: "error", message: t.demoError };
  redirect(safeNext(String(formData.get("next") ?? "")));
}
