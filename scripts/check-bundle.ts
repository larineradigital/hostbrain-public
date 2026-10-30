/**
 * Fails when a secret could reach the browser (secrets stay server-side).
 * Runs after `next build` (see package.json) and scans what the browser can download:
 *
 * - `.next/static` (client JS and CSS) for the markers `QLOO`, `OPENAI_API_KEY` (the OpenAI
 *   SDK in a client bundle), OpenAI key shapes (`sk-proj-…`, `sk-svcacct-…`, `sk-admin-…`,
 *   legacy `sk-…`), `sk-ant` and `service_role`;
 * - `.next/static` and the prerendered pages in `.next/server/app` (HTML and RSC payloads)
 *   for the actual values of QLOO_API_KEY, OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY,
 *   read from the environment and `.env.local` when they are set.
 *
 * Prints file names and which check matched, never the matched text.
 *
 *   pnpm tsx scripts/check-bundle.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const ROOT = process.cwd();
const STATIC_DIR = join(ROOT, ".next/static");
const PRERENDER_DIR = join(ROOT, ".next/server/app");

const MARKERS: { name: string; pattern: RegExp }[] = [
  { name: "QLOO", pattern: /QLOO/ },
  { name: "OPENAI_API_KEY", pattern: /OPENAI_API_KEY/ },
  { name: "sk-proj/svcacct/admin key", pattern: /\bsk-(?:proj|svcacct|admin)-[\w-]{16,}/ },
  { name: "sk- key", pattern: /\bsk-[A-Za-z0-9]{32,}/ },
  { name: "sk-ant", pattern: /sk-ant/ },
  { name: "service_role", pattern: /service_role/ },
];

const SECRET_NAMES = ["QLOO_API_KEY", "OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const secrets = SECRET_NAMES.flatMap((name) => {
  const value = process.env[name]?.trim();
  // Short values (placeholders) would match by accident.
  return value && value.length >= 16 ? [{ name, value }] : [];
});

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const TEXT_FILE = /\.(js|mjs|cjs|css|map|json|html|rsc|body|txt)$/;

if (!existsSync(STATIC_DIR)) {
  console.error("check-bundle: .next/static is missing. Run `pnpm build` first.");
  process.exit(1);
}

const problems: string[] = [];
let scanned = 0;

for (const file of walk(STATIC_DIR)) {
  if (!TEXT_FILE.test(file)) continue;
  scanned++;
  const text = readFileSync(file, "utf8");
  for (const { name, pattern } of MARKERS)
    if (pattern.test(text)) problems.push(`${relative(ROOT, file)}: contains "${name}"`);
  for (const { name, value } of secrets)
    if (text.includes(value))
      problems.push(`${relative(ROOT, file)}: contains the value of ${name}`);
}

if (existsSync(PRERENDER_DIR)) {
  for (const file of walk(PRERENDER_DIR)) {
    if (!/\.(html|rsc|body)$/.test(file)) continue;
    scanned++;
    const text = readFileSync(file, "utf8");
    for (const { name, value } of secrets)
      if (text.includes(value))
        problems.push(`${relative(ROOT, file)}: contains the value of ${name}`);
  }
}

if (problems.length) {
  console.error(`check-bundle: secrets may reach the browser (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `check-bundle: ${scanned} client files clean (markers: ${MARKERS.map((m) => m.name).join(", ")}; ` +
    `secret values checked: ${secrets.map((s) => s.name).join(", ") || "none set"}).`,
);
