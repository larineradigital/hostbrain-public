import { expect, test, type Page } from "@playwright/test";

import { admin, newHostClient } from "./helpers/auth";

// The guest guide renders every section from a mock-mode generation, and
// "Why this?" opens with the signals and the limits line. No login.

const TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
const token = () =>
  Array.from({ length: 21 }, () => TOKEN_CHARS[Math.floor(Math.random() * 64)]).join("");

const LIMITS =
  "Based on aggregate taste patterns of people with similar interests, not a prediction about you.";

async function createReadyGuide(
  hostId: string,
  request: import("@playwright/test").APIRequestContext,
) {
  const db = admin();
  await db.from("hosts").update({ display_name: "Rosa" }).eq("id", hostId);
  const { data: property, error } = await db
    .from("properties")
    .insert({
      host_id: hostId,
      name: "Fable Street Flat",
      address: "12 Fable Street, Old Harbour",
      city: "Lisbon",
      country_code: "PT",
      lat: 38.7139,
      lng: -9.1394,
      house_notes: "Wi-Fi: FableGuest\nCheck-out by 11:00, keys in the bowl.",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { error: picksError } = await db.from("host_picks").insert([
    {
      property_id: property.id,
      qloo_entity_id: "FIX-P-001",
      name: "Lantern & Ladle",
      note: "Order the stew",
      position: 0,
    },
    {
      property_id: property.id,
      qloo_entity_id: "FIX-P-020",
      name: "Gallery",
      note: null,
      position: 1,
    },
  ]);
  if (picksError) throw new Error(picksError.message);
  const guideToken = token();
  const { data: guide, error: guideError } = await db
    .from("guides")
    .insert({
      property_id: property.id,
      token: guideToken,
      guest_first_name: "Zelda",
      check_in: "2026-10-24",
      check_out: "2026-10-28",
      age_band: "25_to_29",
    })
    .select("id")
    .single();
  if (guideError) throw new Error(guideError.message);
  await db.from("quiz_answers").insert({
    guide_id: guide.id,
    artist_ids: ["FIX-A-001"],
    artist_names: ["Mara Solé"],
    media_ids: ["FIX-M-001"],
    media_names: ["A Quiet Tram to Nowhere"],
    tag_urns: ["urn:tag:cuisine:qloo:natural_wine"],
    tag_labels: ["natural_wine"],
  });
  const generated = await request.post(`/api/guides/${guide.id}/generate`, {
    data: { token: guideToken },
  });
  expect(generated.status()).toBe(200);
  expect(await generated.text()).toContain('"type":"done"');
  return { guideId: guide.id, token: guideToken };
}

/** No third-party network in e2e: map tiles, placeholder images, weather, address search. */
async function blockExternal(page: Page) {
  await page.route(/photon\.komoot\.io|openfreemap\.org|placehold\.co|open-meteo\.com/, (route) =>
    route.abort(),
  );
}

test("the guest guide renders every section and “Why this?” explains a pick", async ({
  page,
  request,
}, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 740 });
  await blockExternal(page);
  const host = await newHostClient();
  try {
    const { guideId, token: guideToken } = await createReadyGuide(host.id, request);
    await page.goto(`/g/${guideToken}`);

    // Hero
    await expect(page.getByText("Hi Zelda,")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Your Lisbon, picked for your taste" }),
    ).toBeVisible();
    await expect(page.getByText(/Staying at Fable Street Flat · 24\s–\s28 Oct/)).toBeVisible();
    await expect(page.getByTestId("weather-chip")).toHaveText("18° and sunny today");

    // Sticky nav, one link per section
    const nav = page.getByRole("navigation", { name: "Sections" });
    for (const name of [
      "Eat",
      "Drink",
      "Do",
      "Rainy day",
      "Host’s picks",
      "Playlist",
      "Films",
      "Map",
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }

    // Every section, with its cards
    const section = (name: string) => page.getByRole("region", { name, exact: true });
    for (const name of [
      "Eat",
      "Drink",
      "Do",
      "Rainy day",
      "Host’s picks for you",
      "Playlist for your stay",
      "Film shelf",
      "Your map",
    ]) {
      await expect(section(name)).toBeVisible();
    }
    await expect(section("Eat").getByRole("article")).toHaveCount(6);
    await expect(section("Drink").getByRole("article")).not.toHaveCount(0);
    const eatCard = section("Eat").getByRole("article").first();
    await expect(eatCard.getByText(/min walk/)).toBeVisible();
    await expect(eatCard.getByRole("link", { name: /^Open in Maps: .+$/ })).toHaveAttribute(
      "href",
      /^https:\/\/www\.google\.com\/maps\/search\//,
    );

    const picks = section("Host’s picks for you");
    await expect(picks.getByRole("article")).toHaveCount(2);
    await expect(picks.getByRole("article").first().getByText("Top match for you")).toBeVisible();
    await expect(picks.getByText("“Order the stew”")).toBeVisible();
    await expect(picks.getByText("Rosa says")).toBeVisible();
    await expect(picks.getByText("Top match for you")).toHaveCount(1);

    const playlist = section("Playlist for your stay");
    await expect(playlist.getByRole("link", { name: "Play all on Spotify" })).toBeVisible();
    await expect(
      playlist.getByRole("link", { name: /^Search .+ on Spotify$/ }).first(),
    ).toHaveAttribute("href", /^https:\/\/open\.spotify\.com\/search\//);
    await expect(
      playlist.getByRole("link", { name: /^Search .+ on Apple Music$/ }).first(),
    ).toHaveAttribute("href", /^https:\/\/music\.apple\.com\/search\?term=/);

    const shelf = section("Film shelf");
    await expect(shelf.getByRole("list", { name: "Films" }).getByRole("listitem")).not.toHaveCount(
      0,
    );
    await expect(
      shelf.getByRole("list", { name: "Shows for nights in" }).getByRole("listitem"),
    ).not.toHaveCount(0);

    // Footer
    await expect(page.getByText("Check-out by 11:00, keys in the bowl.")).toBeVisible();
    await expect(page.getByText(/Your name never leaves Host Brain/)).toBeVisible();

    // G5: "Why this?" on the first Eat card
    const name = (await eatCard.getByRole("heading", { level: 3 }).textContent())!;
    await eatCard.getByRole("button", { name: `Why this? ${name}` }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name })).toBeVisible();
    await expect(sheet.getByText("Picked with Qloo taste data")).toBeVisible();
    await expect(sheet.getByText("Taste match")).toBeVisible();
    await expect(sheet.getByText("#1 of 6 in Eat for your taste")).toBeVisible();
    await expect(sheet.getByText("Age group 25 to 29")).toBeVisible();
    await expect(sheet.getByText(/^Within .+ of your stay$/)).toBeVisible();
    await expect(sheet.getByText(LIMITS)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // The hero badge explains the whole guide
    await page.getByRole("button", { name: "Picked with Qloo taste data" }).click();
    await expect(page.getByRole("dialog").getByText("How your guide was picked")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Mara Solé")).toBeVisible();
    // Q11, stored with the guide (mock demographics for these picks skew 25–29)
    await expect(page.getByRole("dialog").getByTestId("taste-twins")).toHaveText(
      "People who share your taste skew 25–29.",
    );
    await expect(page.getByRole("dialog").getByText(LIMITS)).toBeVisible();
    await page.keyboard.press("Escape");

    // Map: loads when scrolled to, with the taste map toggle
    await section("Your map").scrollIntoViewIfNeeded();
    await expect(page.getByRole("region", { name: "Map of your picks" })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Your taste map" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("list", { name: "Legend" })).toContainText("Host’s picks");

    // Nothing is wider than the phone.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // The first open is recorded.
    await expect
      .poll(
        async () =>
          (await admin().from("guides").select("viewed_at").eq("id", guideId).single()).data
            ?.viewed_at,
      )
      .not.toBeNull();
  } finally {
    await host.cleanup();
  }
});

test("the weather route needs a real guide token", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API check, run once");
  expect((await request.get("/api/weather")).status()).toBe(404);
  expect((await request.get(`/api/weather?token=${token()}`)).status()).toBe(404);
});
