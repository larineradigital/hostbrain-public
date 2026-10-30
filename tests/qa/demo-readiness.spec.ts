import { expect, test, type Page } from "@playwright/test";

import { admin } from "../e2e/helpers/auth";

// Demo-readiness checklist on the real seeded demo data. Every page is
// watched for console errors, uncaught exceptions and 4xx/5xx responses from this app.

const LIMITS_LINE =
  "Based on aggregate taste patterns of people with similar interests, not a prediction about you.";

interface Problems {
  console: string[];
  http: string[];
}

function watch(page: Page, baseURL: string): Problems {
  const problems: Problems = { console: [], http: [] };
  page.on("console", (message) => {
    if (message.type() === "error") problems.console.push(`${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.console.push(`${page.url()}: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(baseURL))
      problems.http.push(`${response.status()} ${response.url()}`);
  });
  return problems;
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `side scroll on ${page.url()}`).toBeLessThanOrEqual(0);
}

/** Every loaded image decoded; lazy ones are scrolled into view first. */
async function expectNoBrokenImages(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((img) => img.complete && img.currentSrc && img.naturalWidth === 0)
      .map((img) => img.currentSrc),
  );
  expect(broken, `broken images on ${page.url()}`).toEqual([]);
}

async function demoLinks(page: Page) {
  await page.goto("/demo");
  const anna = page.getByRole("article", { name: "Anna & Jonas, from Berlin" });
  const millers = page.getByRole("article", { name: "The Millers, from Texas" });
  const annaHref = await anna.getByRole("link", { name: "Open Anna's guide" }).getAttribute("href");
  const compare = await anna
    .getByRole("link", { name: "Open the compare view" })
    .getAttribute("href");
  // Phones show one guest at a time.
  const tab = page.getByRole("tab", { name: "The Millers" });
  if (await tab.isVisible()) await tab.click();
  const millersHref = await millers
    .getByRole("link", { name: /^Open .+ guide$/ })
    .getAttribute("href");
  return { anna: annaHref!, millers: millersHref!, compare: compare! };
}

test("judge flow: landing, demo, guides, Why this?, compare", async ({ page, baseURL }) => {
  const problems = watch(page, baseURL!);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoSideScroll(page);
  await expectNoBrokenImages(page);

  const links = await demoLinks(page);
  await expectNoSideScroll(page);

  for (const href of [links.anna, links.millers]) {
    await page.goto(href);
    for (const name of ["Eat", "Drink", "Do"]) {
      await expect(
        page.getByRole("region", { name, exact: true }).getByRole("article").first(),
      ).toBeVisible();
    }
    await expectNoSideScroll(page);
    await expectNoBrokenImages(page);
    await page
      .getByRole("button", { name: /^Why this\?/ })
      .first()
      .click();
    await expect(page.getByRole("dialog").getByText(LIMITS_LINE)).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/Qloo/).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Ask your concierge" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  }

  await page.goto(links.compare);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoSideScroll(page);

  expect(problems.console, "console errors").toEqual([]);
  expect(problems.http, "4xx/5xx").toEqual([]);
});

test("judge flow: try as a guest", async ({ page, baseURL }) => {
  const problems = watch(page, baseURL!);
  await page.goto("/demo");
  // Live: a fresh guide's quiz. Replay mode or busy: a note and a ready-made guide.
  const readyMade = page.getByRole("link", { name: "Open a ready-made guide" });
  const tryButton = page.getByRole("button", { name: "Try it as a guest" }).first();
  await expect(readyMade.or(tryButton).first()).toBeVisible();
  if (!(await readyMade.isVisible())) {
    await tryButton.click();
    await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{21}\/quiz$|\/demo\?note=/);
  }
  if (!page.url().endsWith("/quiz")) {
    await readyMade.click();
    await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{21}$/);
    await expect(page.getByRole("region", { name: "Eat", exact: true })).toBeVisible();
  }
  await expectNoSideScroll(page);
  expect(problems.console, "console errors").toEqual([]);
  expect(problems.http, "4xx/5xx").toEqual([]);
});

test("host flow: demo-host login, dashboard, property, print, self-serve", async ({
  page,
  baseURL,
}) => {
  const problems = watch(page, baseURL!);
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in as the demo host" }).click();
  await expect(page).toHaveURL(/\/host$/);
  const property = page.getByRole("link", { name: /Alfama Sunlight Flat/ }).first();
  await expect(property).toBeVisible();
  await expectNoSideScroll(page);

  await property.click();
  await expect(page).toHaveURL(/\/host\/properties\/[0-9a-f-]{36}/);
  await expectNoSideScroll(page);
  const guideHref = await page
    .locator('a[href^="/host/guides/"][href$="/print"]')
    .first()
    .getAttribute("href");
  if (guideHref) {
    await page.goto(guideHref);
    await expect(page.locator("svg").first()).toBeVisible();
  }

  // Self-serve on the demo hotel.
  const { data: hotel } = await admin()
    .from("properties")
    .select("self_serve_token, self_serve_enabled, hosts!inner(id)")
    .eq("demo_key", "P3")
    .eq("self_serve_enabled", true)
    .limit(1)
    .maybeSingle();
  if (hotel?.self_serve_token) {
    await page.goto(`/s/${hotel.self_serve_token}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSideScroll(page);
  }

  expect(problems.console, "console errors").toEqual([]);
  expect(problems.http, "4xx/5xx").toEqual([]);
});
