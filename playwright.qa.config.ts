import { defineConfig, devices } from "@playwright/test";

/**
 * Demo-readiness run (console errors, 4xx/5xx, mobile and desktop, light and dark) against a server that is already running, with the
 * real seeded demo data: `pnpm build && QLOO_MODE=replay pnpm start`, then `pnpm qa`.
 * Set QA_BASE_URL to check another deployment. Not part of `pnpm e2e`.
 */
const baseURL = process.env.QA_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/qa",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/qa",
  use: { baseURL, screenshot: "only-on-failure" },
  projects: [
    { name: "mobile-light", use: { ...devices["Pixel 7"], colorScheme: "light" } },
    { name: "mobile-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "desktop-dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
  ],
});
