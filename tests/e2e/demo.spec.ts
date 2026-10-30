import { expect, test, type Page } from "@playwright/test";

import { blockExternal } from "./helpers/guides";

// The landing page, /demo, "Try as a guest" and the demo-host login. The
// e2e demo host and guests A–E are seeded in mock mode by global-setup.ts.

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

/** Long venue names must truncate, never widen the page on a phone. */
async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("landing shows every section with the two demo guides", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your guests aren't the same. Why is your guidebook?",
  );
  for (const name of [
    "Same flat. Two guests. Two different trips.",
    "How it works",
    "Why it's different",
    "For hotels",
    "Pricing",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await expect(page.getByText("Anna & Jonas, from Berlin")).toBeVisible();
  await expect(page.getByText("The Millers, from Texas")).toBeVisible();
  await expect(page.getByText("Hi Anna 👋")).toBeVisible();
  await expect(page.getByText("$49")).toBeVisible();
  await expect(page.getByText("Built with Qloo taste data")).toBeVisible();
  await expectNoSideScroll(page);
  await expect(page.getByRole("button", { name: "Try it as a guest" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See the comparison" })).toHaveAttribute(
    "href",
    /^\/g\/[A-Za-z0-9_-]{21}\/compare$/,
  );

  await page.getByRole("link", { name: "See two guests, one flat" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { level: 1, name: "Two guests, one flat" })).toBeVisible();
});

test("/demo shows both Lisbon guests and opens a guide and the compare view", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  await expect(page.getByText(/both staying at the Alfama Sunlight Flat in Lisbon/)).toBeVisible();
  const anna = page.getByRole("article", { name: "Anna & Jonas, from Berlin" });
  const millers = page.getByRole("article", { name: "The Millers, from Texas" });

  if (isMobile) {
    // Tabs on phones: one guest at a time.
    await expect(anna).toBeVisible();
    await expect(millers).toBeHidden();
    await page.getByRole("tab", { name: "The Millers" }).click();
    await expect(millers).toBeVisible();
    await expect(anna).toBeHidden();
    await page.getByRole("tab", { name: "Anna & Jonas" }).click();
  } else {
    await expect(page.getByRole("tablist")).toBeHidden();
    await expect(anna).toBeVisible();
    await expect(millers).toBeVisible();
  }
  await expectNoSideScroll(page);
  for (const title of ["Eat", "Drink", "Do"]) {
    await expect(anna.getByRole("heading", { level: 3, name: title })).toBeVisible();
  }

  const compare = anna.getByRole("link", { name: "Open the compare view" });
  await expect(compare).toHaveAttribute("href", /^\/g\/[A-Za-z0-9_-]{21}\/compare$/);
  await anna.getByRole("link", { name: "Open Anna's guide" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{21}$/);
  await expect(page.getByText(/^Hi Anna/)).toBeVisible();

  await page.goBack();
  await page
    .getByRole("article", { name: "Anna & Jonas, from Berlin" })
    .getByRole("link", { name: "Open the compare view" })
    .click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.getByText("AI alone").first()).toBeVisible();
});

test("Try as a guest creates a fresh guide on the demo flat and starts the quiz", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Try as a guest" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{21}\/quiz$/);
  await expect(page.getByText("Music you love")).toBeVisible();
});

test("a busy or paused demo explains itself and offers a ready-made guide", async ({ page }) => {
  await page.goto("/demo?note=busy");
  const panel = page.getByRole("region", { name: "Try it as a guest" });
  await expect(panel.getByRole("status")).toContainText("here's a guide we made earlier");
  await expect(panel.getByRole("link", { name: "Open a ready-made guide" })).toHaveAttribute(
    "href",
    /^\/g\/[A-Za-z0-9_-]{21}$/,
  );
  await expect(panel.getByRole("button", { name: "Try as a guest" })).toHaveCount(0);
});

test("the demo login opens the dashboard with the demo properties, no email", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in as the demo host" }).click();
  await expect(page).toHaveURL(/\/host$/);
  for (const name of ["Alfama Sunlight Flat", "Galata Rooftop Loft", "The Little Harbour Hotel"]) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
});
