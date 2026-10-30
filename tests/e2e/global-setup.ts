import { execFileSync } from "node:child_process";

import { admin } from "./helpers/auth";
import { E2E_DEMO_HOST_EMAIL } from "./helpers/demo-host";

/**
 * Seeds the e2e demo host (lib/demo/personas.ts, mock Qloo, recorded compare fixture) with
 * the real seed script, so /demo, the landing page and the demo login have data. The seed is
 * idempotent; earlier "Try as a guest" guides are removed so the hourly demo limit resets.
 */
export default async function globalSetup() {
  execFileSync("pnpm", ["tsx", "--conditions=react-server", "scripts/seed-demo.ts", "--mock"], {
    stdio: "pipe",
    env: {
      ...process.env,
      DEMO_HOST_EMAIL: E2E_DEMO_HOST_EMAIL,
      QLOO_MODE: "mock",
      OPENAI_API_KEY: "",
      COMPARE_MODE: "replay",
    },
  });
  const db = admin();
  const { data: hostId } = await db.rpc("demo_host_id", { target_email: E2E_DEMO_HOST_EMAIL });
  const { data: properties } = await db.from("properties").select("id").eq("host_id", hostId);
  await db
    .from("guides")
    .delete()
    .in(
      "property_id",
      (properties ?? []).map((p) => p.id),
    )
    .eq("source", "demo")
    .is("demo_key", null);
}
