/**
 * Re-runs generation for the demo guides, for example on the morning of a
 * demo. Refreshes the Qloo cache that replay mode serves from, moves the stay dates to
 * start today, rewrites the guide lines with the model once OPENAI_API_KEY is set, and fills
 * in any missing AI-alone comparison for the Lisbon pair. Prints counts only.
 *
 *   pnpm tsx --conditions=react-server scripts/warm-cache.ts [--env production]
 *        [--only A,B] [--recompare] [--keep-dates]
 *
 * `--recompare` drops the pair's cached comparisons first (for example after adding the
 * key). A guide whose rerun fails keeps its previous sections. Run scripts/seed-demo.ts first.
 */
import { flag, loadDemoEnv, option, qlooUsage } from "./demo-env";

const envName = loadDemoEnv();

async function main() {
  const { readServerEnv } = await import("@/lib/env");
  const { createServiceClient } = await import("@/lib/db/server");
  const { DEMO_GUESTS, DEMO_PAIR } = await import("@/lib/demo/personas");
  const { assertSeedTarget, demoStayDates } = await import("@/lib/demo/rules");
  const { compareDemoGuide, generateDemoGuide } = await import("@/lib/demo/seed");

  const env = readServerEnv();
  assertSeedTarget(env.NEXT_PUBLIC_SUPABASE_URL, envName);
  const writer = env.OPENAI_API_KEY ? env.OPENAI_MODEL : "fallback lines (no key)";
  console.log(`env ${envName} | qloo ${env.QLOO_MODE} | writer ${writer}`);

  const db = createServiceClient();
  const since = new Date();
  const { data: hostId, error: hostError } = await db.rpc("demo_host_id", {
    target_email: env.DEMO_HOST_EMAIL,
  });
  if (hostError) throw new Error(hostError.message);
  if (!hostId) throw new Error("No demo host yet: run scripts/seed-demo.ts first");

  const only = option("only")
    ?.split(",")
    .map((key) => key.trim().toUpperCase());
  const keys = DEMO_GUESTS.map((g) => g.key).filter((key) => !only || only.includes(key));
  const { data: rows, error } = await db
    .from("guides")
    .select("id, demo_key, status, properties!inner (host_id)")
    .eq("properties.host_id", hostId)
    .in("demo_key", keys);
  if (error) throw new Error(error.message);

  const ready = new Set<string>();
  for (const key of keys) {
    const guide = rows.find((r) => r.demo_key === key);
    if (!guide) {
      console.log(`${key} missing (run seed-demo.ts)`);
      continue;
    }
    if (!flag("keep-dates")) {
      const { checkIn, checkOut } = demoStayDates(new Date());
      await db.from("guides").update({ check_in: checkIn, check_out: checkOut }).eq("id", guide.id);
    }
    const run = await generateDemoGuide(db, guide.id, { wasReady: guide.status === "ready" });
    if (run.ok) {
      ready.add(key);
      const empty = Object.entries(run.sections).filter(([, n]) => n === 0);
      console.log(
        `${key} regenerated in ${(run.ms / 1000).toFixed(1)} s (writer: ${run.writer})` +
          (empty.length ? `, empty: ${empty.map(([s]) => s).join(", ")}` : ""),
      );
    } else {
      if (guide.status === "ready") ready.add(key);
      console.log(`${key} FAILED (kept previous sections): ${run.error}`);
    }
  }

  const pair = rows.filter((r) => (DEMO_PAIR as readonly string[]).includes(r.demo_key ?? ""));
  if (flag("recompare") && pair.length) {
    await db
      .from("comparisons")
      .delete()
      .in(
        "guide_id",
        pair.map((r) => r.id),
      );
  }
  for (const guide of pair) {
    if (!ready.has(guide.demo_key!)) continue;
    console.log(`compare ${guide.demo_key}: ${await compareDemoGuide(db, guide.id)}`);
  }

  const usage = await qlooUsage(db, since);
  console.log(
    `qloo: ${usage.calls} calls, ${usage.cacheHits} cache hits, ${usage.httpRequests} HTTP requests` +
      `, ${usage.errors} errors` +
      (usage.monthRemaining !== null ? `, ${usage.monthRemaining} left this month` : ""),
  );
  if (!env.OPENAI_API_KEY) {
    console.log("No OPENAI_API_KEY: guide lines are the fallback templates. Set it and rerun.");
  }
}

main().catch((err) => {
  console.error("FAIL", (err as Error).message);
  process.exit(1);
});
