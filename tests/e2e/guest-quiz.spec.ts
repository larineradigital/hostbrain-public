import { expect, test, type Page } from "@playwright/test";

import { admin, newHostClient } from "./helpers/auth";

// A guest opens their token link, takes the quiz and reaches the building screen.
// Mock Qloo, no login.

const TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
const token = () =>
  Array.from({ length: 21 }, () => TOKEN_CHARS[Math.floor(Math.random() * 64)]).join("");

async function createGuide(hostId: string) {
  const db = admin();
  await db.from("hosts").update({ display_name: "Rosa" }).eq("id", hostId);
  const { data: property, error } = await db
    .from("properties")
    .insert({
      host_id: hostId,
      name: "Fable Street Flat",
      address: "12 Fable Street, Old Harbour",
      city: "Lisbon",
      lat: 38.7139,
      lng: -9.1394,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const guideToken = token();
  const { data: guide, error: guideError } = await db
    .from("guides")
    .insert({ property_id: property.id, token: guideToken, guest_first_name: "Zelda" })
    .select("id")
    .single();
  if (guideError) throw new Error(guideError.message);
  return { guideId: guide.id, token: guideToken };
}

/** No third-party network in e2e: address search, map tiles and placeholder images. */
async function blockExternal(page: Page) {
  await page.route(/photon\.komoot\.io|openfreemap\.org|placehold\.co/, (route) => route.abort());
}

test("a guest takes the quiz and watches their guide being built", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 740 });
  await blockExternal(page);
  const host = await newHostClient();
  try {
    const { guideId, token: guideToken } = await createGuide(host.id);

    // G1 welcome
    await page.goto(`/g/${guideToken}`);
    await expect(page.getByRole("heading", { name: "Hi Zelda 👋" })).toBeVisible();
    await expect(
      page.getByText("Your host Rosa made you a personal guide to Lisbon."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Start (20 seconds)" }).click();

    // Step 1: popular picks before typing, then type-ahead
    await expect(page).toHaveURL(new RegExp(`/g/${guideToken}/quiz$`));
    await expect(page.getByRole("heading", { name: "Music you love" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mara Solé/ })).toBeVisible();
    await page.getByPlaceholder("Search artists").fill("velvet");
    await page.getByRole("button", { name: /The Velvet Tides/ }).click();
    await expect(page.getByRole("button", { name: "Remove The Velvet Tides" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: films and shows
    await expect(page.getByRole("heading", { name: "Films and shows you love" })).toBeVisible();
    await page.getByPlaceholder("Search films and shows").fill("tram");
    await page.getByRole("button", { name: /A Quiet Tram to Nowhere/ }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 3: food, vibe and dietary chips from qloo_tag_map
    await expect(page.getByRole("heading", { name: "Food and vibe" })).toBeVisible();
    await page.getByRole("button", { name: "Natural wine" }).click();
    await page.getByRole("button", { name: "Cosy" }).click();
    await page.getByRole("button", { name: "Vegetarian" }).click();
    await expect(page.getByRole("button", { name: "Cosy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Nothing on the page is wider than a 360-px phone.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Build my guide" }).click();

    // G3 building: the step list ticks off from the SSE stream, then the guide opens.
    await expect(page).toHaveURL(new RegExp(`/g/${guideToken}/building$`));
    await expect(page.getByRole("heading", { name: "Building your guide" })).toBeVisible();
    const steps = page.getByRole("list", { name: "Progress" });
    await expect(steps.getByText("Making your playlist")).toBeVisible();
    await expect(steps.locator("li").last()).toHaveAttribute("data-status", "done");
    await expect(page).toHaveURL(new RegExp(`/g/${guideToken}$`));

    const db = admin();
    const { data: quiz } = await db
      .from("quiz_answers")
      .select("artist_names, media_names, tag_labels, tag_urns, dietary, skipped")
      .eq("guide_id", guideId)
      .single();
    expect(quiz).toMatchObject({
      artist_names: ["The Velvet Tides"],
      media_names: ["A Quiet Tram to Nowhere"],
      tag_labels: ["natural_wine", "cosy"],
      tag_urns: ["urn:tag:cuisine:qloo:natural_wine", "urn:tag:ambience:qloo:cozy"],
      dietary: ["vegetarian"],
      skipped: false,
    });
    const { data: guide } = await db.from("guides").select("status").eq("id", guideId).single();
    expect(guide!.status).toBe("ready");
  } finally {
    await host.cleanup();
  }
});

test("“Skip, surprise me” goes straight to building", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "same flow on both projects");
  await blockExternal(page);
  const host = await newHostClient();
  try {
    const { guideId, token: guideToken } = await createGuide(host.id);
    await page.goto(`/g/${guideToken}`);
    await page.getByRole("button", { name: "Skip, surprise me" }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${guideToken}/(building)?$`));
    await expect(page).toHaveURL(new RegExp(`/g/${guideToken}$`));

    const { data: quiz } = await admin()
      .from("quiz_answers")
      .select("skipped, artist_ids")
      .eq("guide_id", guideId)
      .single();
    expect(quiz).toEqual({ skipped: true, artist_ids: [] });

    // The quiz is closed once the guide is built.
    await page.goto(`/g/${guideToken}/quiz`);
    await expect(page).toHaveURL(new RegExp(`/g/${guideToken}$`));
  } finally {
    await host.cleanup();
  }
});

test("an unknown token shows not found", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "same on both projects");
  await page.goto(`/g/${token()}`);
  await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();
  await page.goto("/g/short");
  await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();
});
