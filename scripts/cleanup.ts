/**
 * The daily retention job, run as a Railway cron service
 * (railway.cron.toml). Deletes `qloo_cache` rows 30 days after they expired
 * (none in replay mode, which serves expired rows) and, 30 days after check-out, clears guest
 * first names and deletes chat messages. Demo guides (demo_key set)
 * are left alone; scripts/seed-demo.ts and warm-cache.ts move their stay dates forward.
 *
 * It always runs at least one query (the cache step), so it also keeps a free Supabase
 * project from pausing after 7 idle days. Prints counts only, never names or messages.
 *
 *   pnpm cleanup [--env production] [--dry-run]
 *
 * Local Supabase only, unless `--env production` (reads .env.production.local), like
 * scripts/seed-demo.ts. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and
 * QLOO_MODE (the web service's value) so replay mode keeps the cache.
 */
import { flag, loadDemoEnv } from "./demo-env";

const envName = loadDemoEnv();
const dryRun = flag("dry-run");

/** Guide IDs per `in` filter, so the request URL stays short. */
const BATCH = 200;

async function main() {
  const { readServerEnv } = await import("@/lib/env");
  const { createServiceClient } = await import("@/lib/db/server");
  const { assertSeedTarget } = await import("@/lib/demo/rules");
  const { cacheDeleteBefore, RETENTION_DAYS, retentionCutoffs } = await import("@/lib/retention");

  const env = readServerEnv();
  assertSeedTarget(env.NEXT_PUBLIC_SUPABASE_URL, envName);
  const db = createServiceClient();
  const now = new Date();
  console.log(`env ${envName} | ${now.toISOString()}${dryRun ? " | dry run" : ""}`);

  // 1. Qloo cache rows that expired 30+ days ago. Always runs a query: this is also the
  // keep-alive. In replay mode nothing is deleted, since replay serves expired rows.
  const expiredBefore = cacheDeleteBefore(now);
  const keepCache = dryRun || env.QLOO_MODE === "replay";
  const cache = keepCache
    ? await db
        .from("qloo_cache")
        .select("key", { count: "exact", head: true })
        .lt("expires_at", expiredBefore)
    : await db.from("qloo_cache").delete({ count: "exact" }).lt("expires_at", expiredBefore);
  if (cache.error) throw new Error(`qloo_cache: ${cache.error.message}`);
  const cacheVerb = dryRun ? "found" : keepCache ? "kept (QLOO_MODE=replay)" : "deleted";
  console.log(`qloo_cache: ${cache.count ?? 0} rows expired before ${expiredBefore} ${cacheVerb}`);

  // 2. Guides past retention: check-out 30+ days ago, or created 30+ days ago without one.
  const cut = retentionCutoffs(now);
  const { data: guides, error } = await db
    .from("guides")
    .select("id")
    .is("demo_key", null)
    .or(
      `check_out.lte.${cut.checkOutOnOrBefore},` +
        `and(check_out.is.null,created_at.lt.${cut.createdBefore})`,
    );
  if (error) throw new Error(`guides: ${error.message}`);
  const ids = (guides ?? []).map((g) => g.id);
  console.log(
    `guides past retention (${RETENTION_DAYS} days after check-out ${cut.checkOutOnOrBefore}` +
      ` or earlier): ${ids.length}`,
  );

  let names = 0;
  let messages = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    if (dryRun) {
      const [named, chats] = await Promise.all([
        db
          .from("guides")
          .select("id", { count: "exact", head: true })
          .in("id", batch)
          .not("guest_first_name", "is", null),
        db.from("chat_messages").select("id", { count: "exact", head: true }).in("guide_id", batch),
      ]);
      if (named.error || chats.error) throw new Error((named.error ?? chats.error)!.message);
      names += named.count ?? 0;
      messages += chats.count ?? 0;
      continue;
    }
    const named = await db
      .from("guides")
      .update({ guest_first_name: null }, { count: "exact" })
      .in("id", batch)
      .not("guest_first_name", "is", null);
    if (named.error) throw new Error(`guides: ${named.error.message}`);
    const chats = await db.from("chat_messages").delete({ count: "exact" }).in("guide_id", batch);
    if (chats.error) throw new Error(`chat_messages: ${chats.error.message}`);
    names += named.count ?? 0;
    messages += chats.count ?? 0;
  }
  const verb = dryRun ? "to clear" : "cleared";
  console.log(`guest first names ${verb}: ${names}, chat messages ${verb}: ${messages}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAIL", (err as Error).message);
    process.exit(1);
  });
