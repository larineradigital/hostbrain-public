/**
 * Seeds the demo (lib/demo/personas.ts): the demo host, properties P1–P3 with host picks found
 * by Qloo search near each one, guests A–E with their quiz answers, live guide generation
 * through lib/guide/pipeline.ts (throttled by the Qloo client), and the AI-alone comparison
 * for the two Lisbon guests. Prints counts and URLs only, never Qloo data or keys.
 *
 *   pnpm tsx --conditions=react-server scripts/seed-demo.ts [--env production] [--regenerate]
 *        [--mock] [--verbose]
 *
 * Idempotent: existing rows are updated in place and ready guides are not regenerated
 * (pass --regenerate, or use scripts/warm-cache.ts). Local Supabase only, unless
 * `--env production` (reads .env.production.local). `--mock` uses mock Qloo and no LLM
 * (e2e). `--verbose` also prints host pick names.
 */
import { flag, loadDemoEnv, qlooUsage } from "./demo-env";

const envName = loadDemoEnv();
const regenerate = flag("regenerate");
const verbose = flag("verbose");

async function main() {
  const { readServerEnv } = await import("@/lib/env");
  const { createServiceClient } = await import("@/lib/db/server");
  const { getQlooClient } = await import("@/lib/qloo/client");
  const { DEMO_GUESTS, DEMO_PAIR, DEMO_PROPERTIES } = await import("@/lib/demo/personas");
  const { assertSeedTarget } = await import("@/lib/demo/rules");
  const seed = await import("@/lib/demo/seed");

  const env = readServerEnv();
  assertSeedTarget(env.NEXT_PUBLIC_SUPABASE_URL, envName);
  const writer = env.OPENAI_API_KEY ? env.OPENAI_MODEL : "fallback lines (no key)";
  console.log(`env ${envName} | qloo ${env.QLOO_MODE} | writer ${writer}`);

  const db = createServiceClient();
  const qloo = getQlooClient();
  const since = new Date();

  const host = await seed.ensureDemoHost(db, env.DEMO_HOST_EMAIL);
  console.log(`demo host ${host.created ? "created" : "exists"}`);

  const properties = new Map<string, { id: string; selfServeToken: string | null }>();
  for (const spec of DEMO_PROPERTIES) {
    const property = await seed.ensureDemoProperty(db, host.hostId, spec);
    properties.set(spec.key, property);
    const picks = await seed.ensureHostPicks(db, property.id, spec, qloo);
    const how = picks.searched
      ? `${picks.resolved} of ${picks.searched} resolved`
      : `${picks.resolved} kept`;
    console.log(
      `${spec.key} ${property.created ? "created" : "updated"}, host picks ${how}` +
        (verbose && picks.names.length ? `: ${picks.names.join(", ")}` : ""),
    );
  }

  const guides = new Map<string, { id: string; token: string; ready: boolean }>();
  for (const spec of DEMO_GUESTS) {
    const property = properties.get(spec.property)!;
    const guide = await seed.ensureDemoGuide(db, property.id, spec, qloo);
    const taste = guide.resolved
      ? `, taste ${guide.resolved.artists}/${spec.artists.length} artists ` +
        `${guide.resolved.media}/${spec.media.length} films/shows`
      : "";
    let ready = guide.status === "ready";
    let line = `${spec.key} ${guide.created ? "created" : "exists"}${taste}`;
    if (!ready || regenerate) {
      const run = await seed.generateDemoGuide(db, guide.id, { wasReady: ready });
      if (run.ok) {
        ready = true;
        const counts = Object.entries(run.sections)
          .map(([section, n]) => `${section} ${n}`)
          .join(", ");
        line += `, generated in ${(run.ms / 1000).toFixed(1)} s (writer: ${run.writer}): ${counts}`;
      } else {
        line += `, generation FAILED after ${(run.ms / 1000).toFixed(1)} s: ${run.error}`;
      }
    } else {
      line += ", ready (skipped; --regenerate to rerun)";
    }
    console.log(line);
    guides.set(spec.key, { id: guide.id, token: guide.token, ready });
  }

  for (const key of DEMO_PAIR) {
    const guide = guides.get(key);
    if (!guide?.ready) continue;
    const state = await seed.compareDemoGuide(db, guide.id);
    console.log(
      `compare ${key}: ${state}` +
        (state === "unavailable" ? " (needs ANTHROPIC_API_KEY; rerun warm-cache.ts later)" : ""),
    );
  }

  const usage = await qlooUsage(db, since);
  console.log(
    `qloo: ${usage.calls} calls, ${usage.cacheHits} cache hits, ${usage.httpRequests} HTTP requests` +
      `, ${usage.errors} errors` +
      (usage.monthRemaining !== null ? `, ${usage.monthRemaining} left this month` : ""),
  );

  const base = env.APP_URL;
  console.log(`\nDemo page:   ${base}/demo`);
  console.log(`Host login:  ${base}/login (demo button needs DEMO_MODE=true)`);
  for (const spec of DEMO_GUESTS) {
    const guide = guides.get(spec.key)!;
    console.log(`Guide ${spec.key}:     ${base}/g/${guide.token}  (${spec.label})`);
  }
  for (const key of DEMO_PAIR) {
    console.log(`Compare ${key}:   ${base}/g/${guides.get(key)!.token}/compare`);
  }
  const hotel = DEMO_PROPERTIES.find((p) => p.selfServe);
  const token = hotel && properties.get(hotel.key)?.selfServeToken;
  if (token) console.log(`Self-serve:  ${base}/s/${token}`);
}

main().catch((err) => {
  console.error("FAIL", (err as Error).message);
  process.exit(1);
});
