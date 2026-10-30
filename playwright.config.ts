import { defineConfig, devices } from "@playwright/test";

import { E2E_DEMO_HOST_EMAIL } from "./tests/e2e/helpers/demo-host";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // e2e always runs in mock mode, with no real keys.
    command: `pnpm build && pnpm start --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      QLOO_MODE: "mock",
      QLOO_API_KEY: "",
      OPENAI_API_KEY: "",
      DEMO_MODE: "true",
      DEMO_HOST_EMAIL: E2E_DEMO_HOST_EMAIL,
      WEATHER_MODE: "mock",
      // The concierge answers from the recorded synthetic fixture (tests/fixtures/openai).
      CONCIERGE_MODE: "replay",
      // So does the AI-alone column of the compare view.
      COMPARE_MODE: "replay",
    },
  },
});
