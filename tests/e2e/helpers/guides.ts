import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { DEMO_PROPERTY, type DemoGuest } from "../../fixtures/concierge-guests";
import { admin } from "./auth";

const TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";

/** A random nanoid-shaped token (21 URL-safe characters). */
export const randomToken = () =>
  Array.from({ length: 21 }, () => TOKEN_CHARS[Math.floor(Math.random() * 64)]).join("");

/** No third-party network in e2e: address search, map tiles, placeholder images, weather. */
export async function blockExternal(page: Page) {
  await page.route(/photon\.komoot\.io|openfreemap\.org|placehold\.co|open-meteo\.com/, (route) =>
    route.abort(),
  );
}

/** The fictional Lisbon demo flat (or a hotel), owned by `hostId`. */
export async function createDemoProperty(
  hostId: string,
  overrides: Partial<{ name: string; type: "apartment" | "hotel" }> = {},
) {
  const { data, error } = await admin()
    .from("properties")
    .insert({ host_id: hostId, ...DEMO_PROPERTY, ...overrides })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** A demo guest's guide with quiz answers, generated through the real route (mock Qloo). */
export async function createReadyGuide(
  propertyId: string,
  guest: DemoGuest,
  request: APIRequestContext,
) {
  const db = admin();
  const token = randomToken();
  const { data: guide, error } = await db
    .from("guides")
    .insert({
      property_id: propertyId,
      token,
      guest_first_name: guest.firstName,
      party_type: guest.partyType,
      age_band: guest.ageBand,
      check_in: "2026-10-24",
      check_out: "2026-10-28",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { error: quizError } = await db
    .from("quiz_answers")
    .insert({ guide_id: guide.id, ...guest.quiz });
  if (quizError) throw new Error(quizError.message);
  const generated = await request.post(`/api/guides/${guide.id}/generate`, { data: { token } });
  expect(generated.status()).toBe(200);
  expect(await generated.text()).toContain('"type":"done"');
  return { guideId: guide.id as string, token };
}
