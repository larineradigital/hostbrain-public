import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  COUPLE_GUEST,
  DEMO_PROPERTY,
  DEMO_QUESTIONS,
  FAMILY_GUEST,
  type DemoGuest,
} from "../fixtures/concierge-guests";
import { admin, newHostClient } from "./helpers/auth";

// The concierge answers the three demo questions (lib/demo/personas.ts) with cards, using
// mock Qloo and the recorded OpenAI fixture (CONCIERGE_MODE=replay). Every card must be a
// Qloo entity from the conversation; the fixture's invented ID must never render.

const TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
const token = () =>
  Array.from({ length: 21 }, () => TOKEN_CHARS[Math.floor(Math.random() * 64)]).join("");

const LIMITS =
  "Based on aggregate taste patterns of people with similar interests, not a prediction about you.";

async function createReadyGuide(hostId: string, guest: DemoGuest, request: APIRequestContext) {
  const db = admin();
  const { data: property, error } = await db
    .from("properties")
    .insert({ host_id: hostId, ...DEMO_PROPERTY })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const guideToken = token();
  const { data: guide, error: guideError } = await db
    .from("guides")
    .insert({
      property_id: property.id,
      token: guideToken,
      guest_first_name: guest.firstName,
      party_type: guest.partyType,
      age_band: guest.ageBand,
      check_in: "2026-10-24",
      check_out: "2026-10-28",
    })
    .select("id")
    .single();
  if (guideError) throw new Error(guideError.message);
  const { error: quizError } = await db
    .from("quiz_answers")
    .insert({ guide_id: guide.id, ...guest.quiz });
  if (quizError) throw new Error(quizError.message);
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

async function openConcierge(page: Page) {
  await page.getByRole("button", { name: "Ask your concierge" }).click();
  const chat = page.getByRole("dialog", { name: "Your concierge" });
  await expect(chat).toBeVisible();
  return chat;
}

/** Sends once the previous reply has finished (the send button is off while one streams). */
async function ask(page: Page, question: string) {
  const input = page.getByRole("textbox", { name: "Message your concierge" });
  await input.fill(question);
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

const cardNames = (scope: ReturnType<Page["getByRole"]>) =>
  scope.getByRole("article").getByRole("heading", { level: 3 });

test("a family asks for a rainy-day plan and gets indoor cards", async ({
  page,
  request,
}, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 740 });
  await blockExternal(page);
  const host = await newHostClient();
  try {
    const { guideId, token: guideToken } = await createReadyGuide(host.id, FAMILY_GUEST, request);
    await page.goto(`/g/${guideToken}`);
    const chat = await openConcierge(page);

    // G6 at rest: greeting, suggested prompts, the limit and the disclaimer.
    await expect(chat.getByText("What are you in the mood for?")).toBeVisible();
    for (const prompt of [
      "Rainy day plan",
      "Dinner for two tonight",
      "Something for the kids",
      "Late-night drinks",
    ]) {
      await expect(chat.getByRole("button", { name: prompt })).toBeVisible();
    }
    await expect(
      chat.getByText("Your concierge suggests places; it can’t book or pay."),
    ).toBeVisible();
    await expect(chat.getByText("0 of 500 characters")).toBeVisible();
    await expect(chat.getByRole("textbox", { name: "Message your concierge" })).toHaveAttribute(
      "maxlength",
      "500",
    );
    const box = await chat.boundingBox();
    expect(box!.height).toBeGreaterThan(page.viewportSize()!.height * 0.85);

    await ask(page, DEMO_QUESTIONS.rainyKids);
    await expect(chat.getByText(DEMO_QUESTIONS.rainyKids)).toBeVisible();
    await expect(chat.getByText(/^Indoor it is\./)).toBeVisible();
    await expect(cardNames(chat)).toHaveText([
      "Tidewater Science House",
      "Starlight Picture House",
      "Museum of Imagined Maps",
    ]);
    // Suggested prompts make way for the conversation.
    await expect(chat.getByRole("button", { name: "Rainy day plan" })).toBeHidden();

    // The chat cards are the guide's cards: Open in Maps and "Why this?".
    const first = chat.getByRole("article").first();
    await expect(first.getByText(/popular with fans of Little Kite Rescue/)).toBeVisible();
    await expect(
      first.getByRole("link", { name: "Open in Maps: Tidewater Science House" }),
    ).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/search\//);
    await first.getByRole("button", { name: "Why this? Tidewater Science House" }).click();
    const why = page.getByRole("dialog", { name: "Tidewater Science House" });
    await expect(why.getByText("Picked with Qloo taste data")).toBeVisible();
    await expect(why.getByText(LIMITS)).toBeVisible();
    // Let the sheet finish opening, so it is the top layer when Escape arrives.
    await why.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await page.keyboard.press("Escape");
    await expect(why).toBeHidden();
    await expect(chat).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // Stored: the exchange and one api_log row per model call.
    const db = admin();
    const { data: rows } = await db
      .from("chat_messages")
      .select("role, content")
      .eq("guide_id", guideId)
      .order("id");
    expect(rows?.map((r) => r.role)).toEqual(["user", "assistant"]);
    const { data: logs } = await db
      .from("api_log")
      .select("endpoint")
      .eq("guide_id", guideId)
      .eq("provider", "openai")
      .like("endpoint", "%concierge%");
    expect(logs?.length).toBeGreaterThanOrEqual(3);
  } finally {
    await host.cleanup();
  }
});

test("a couple asks for dinner and music, and the chat survives a reload", async ({
  page,
  request,
}, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 740 });
  await blockExternal(page);
  const host = await newHostClient();
  try {
    const { token: guideToken } = await createReadyGuide(host.id, COUPLE_GUEST, request);
    await page.goto(`/g/${guideToken}`);
    let chat = await openConcierge(page);

    await ask(page, DEMO_QUESTIONS.romanticDinner);
    await expect(chat.getByText(/^Three relaxed places for dinner tonight/)).toBeVisible();
    await expect(cardNames(chat)).toHaveText([
      "Lantern & Ladle",
      "Little Fig Kitchen",
      "Green Lark Canteen",
    ]);
    await expect(
      chat.getByText("Popular with people who love Mara Solé, and just 200 m from your door"),
    ).toBeVisible();
    // The fixture also asked for an invented ID; the server dropped it.
    await expect(chat.getByText(/invented pick/i)).toHaveCount(0);

    await ask(page, DEMO_QUESTIONS.musicTonight);
    await expect(chat.getByText(/^For dancing tonight/)).toBeVisible();
    await expect(cardNames(chat)).toHaveText([
      "Lantern & Ladle",
      "Little Fig Kitchen",
      "Green Lark Canteen",
      "The Velvet Cellar",
      "Lumen Hall",
      "The Midnight Cartographer",
    ]);

    await page.reload();
    chat = await openConcierge(page);
    await expect(chat.getByText(DEMO_QUESTIONS.musicTonight)).toBeVisible();
    await expect(cardNames(chat)).toHaveCount(6);
    await expect(chat.getByRole("button", { name: "Rainy day plan" })).toBeHidden();
  } finally {
    await host.cleanup();
  }
});

test("the chat route checks the token and the message", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API check, run once");
  const host = await newHostClient();
  try {
    const { guideId, token: guideToken } = await createReadyGuide(host.id, COUPLE_GUEST, request);
    const post = (data: unknown) => request.post(`/api/guides/${guideId}/chat`, { data });
    expect((await post({ token: token(), message: "Hi" })).status()).toBe(404);
    expect((await post({ token: guideToken, message: "x".repeat(501) })).status()).toBe(400);
    expect((await post({ token: guideToken, message: "   " })).status()).toBe(400);
    const ok = await post({ token: guideToken, message: "Hello there" });
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toContain("text/event-stream");
    const body = await ok.text();
    expect(body).toContain('"type":"text"');
    expect(body).toContain('"type":"done"');
  } finally {
    await host.cleanup();
  }
});
