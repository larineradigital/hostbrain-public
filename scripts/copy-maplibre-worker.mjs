// MapLibre loads its tile worker from a separate file next to its own module, which the
// Next.js bundler doesn't emit. Copy it into public/ (git-ignored) so the app can serve it,
// versioned so a MapLibre upgrade never serves a stale worker. Runs on postinstall.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const outDir = join("public", "vendor", "maplibre");
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(outDir)) rmSync(join(outDir, file));
copyFileSync(
  join(dirname(pkgPath), "dist", "maplibre-gl-worker.mjs"),
  join(outDir, `worker-${version}.mjs`),
);
console.log(`maplibre worker ${version} copied to ${outDir}`);
