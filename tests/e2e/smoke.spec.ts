import { expect, test } from "@playwright/test";
import { version as maplibreVersion } from "maplibre-gl/package.json";

test("landing page renders the hero and actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("guidebook");
  await expect(page.getByRole("link", { name: "See two guests, one flat" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Host login" })).toBeVisible();
});

test("health reports mock mode and the model", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({
    ok: true,
    qlooMode: "mock",
    llmProvider: "openai",
    model: expect.any(String),
  });
});

test("placeholder routes respond", async ({ page }) => {
  for (const path of ["/demo", "/login", "/g/test-token", "/g/test-token/quiz"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("the MapLibre worker is served (bundler doesn't emit it)", async ({ request }) => {
  const res = await request.get(`/vendor/maplibre/worker-${maplibreVersion}.mjs`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("javascript");
});
