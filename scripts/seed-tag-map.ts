/**
 * Seeds `qloo_tag_map` from lib/qloo/tags.ts (upsert, safe to re-run).
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (a local `supabase start` works too). Prints the row count only.
 *
 *   pnpm tsx --conditions=react-server scripts/seed-tag-map.ts
 *   pnpm tsx --conditions=react-server scripts/seed-tag-map.ts --sql   # print SQL instead
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;

async function main() {
  const { TAG_MAP, seedTagMap } = await import("@/lib/qloo/tags");

  if (process.argv.includes("--sql")) {
    const values = TAG_MAP.map(
      (entry, position) =>
        `(${quote(entry.label)}, ${quote(entry.kind)}, ${quote(entry.display)}, array[${entry.urns.map(quote).join(", ")}], ${position})`,
    );
    console.log(
      `insert into public.qloo_tag_map (label, kind, display, urns, position) values\n  ${values.join(",\n  ")}\n` +
        `on conflict (label) do update set kind = excluded.kind, display = excluded.display, urns = excluded.urns, position = excluded.position;`,
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`qloo_tag_map: ${await seedTagMap(db)} rows upserted`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
