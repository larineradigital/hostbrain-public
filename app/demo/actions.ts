"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { startDemoGuest } from "@/lib/demo/data";
import { clientIp } from "@/lib/rate-limit";

/**
 * "Try as a guest" (L1, L2): a fresh guide on the demo flat, straight into the quiz. When
 * live generation is paused (replay mode) or the demo is busy, /demo explains and offers a
 * guide made earlier.
 */
export async function tryAsGuest() {
  const result = await startDemoGuest(clientIp(await headers()));
  if (result.ok) redirect(`/g/${result.token}/quiz`);
  const note = result.reason === "not_seeded" ? "missing" : result.reason;
  redirect(`/demo?note=${note}#try`);
}
