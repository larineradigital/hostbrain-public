/** Public Supabase settings (URL and anon key are safe in the browser; RLS protects data). */
export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (run `pnpm db:start` for a local one).",
    );
  }
  return { url, anonKey };
}
