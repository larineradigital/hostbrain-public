import { expect, test } from "@playwright/test";

import { admin, signInAsNewHost, type TestHost } from "./helpers/auth";
import { blockExternal, createDemoProperty, randomToken } from "./helpers/guides";

// Hotel self-serve. The host turns on the self-serve QR; a guest opens the
// link, gives a first name, dates and party type, and goes through the quiz to a guide.
// Mock Qloo, no guest login. 30 new self-serve guides per property per hour.

let host: TestHost | undefined;

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

test.afterEach(async () => {
  await host?.cleanup();
  host = undefined;
});

test("a hotel guest scans the self-serve QR and gets their own guide", async ({ page }) => {
  host = await signInAsNewHost(page);
  const propertyId = await createDemoProperty(host.id, { name: "Hotel Fabula", type: "hotel" });

  // Host: Settings → turn self-serve on → link, QR, download and print card.
  await page.goto(`/host/properties/${propertyId}?tab=settings`);
  const card = page.getByRole("region", { name: "Self-serve QR" });
  await card.getByRole("switch", { name: "Self-serve guides" }).click();
  await expect(card.getByRole("switch", { name: "Self-serve guides" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const url = (await card.getByTestId("self-serve-url").textContent())!.trim();
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]{21}$/);
  await expect(card.getByRole("img", { name: "Self-serve QR code" })).toBeVisible();
  const qr = await page.request.get(`/host/properties/${propertyId}/qr`);
  expect(qr.headers()["content-type"]).toContain("image/svg+xml");
  expect(await qr.text()).toContain("<svg");
  await expect(card.getByRole("link", { name: "Print card" })).toHaveAttribute(
    "href",
    `/host/properties/${propertyId}/print`,
  );

  // Guest: the entry page (no login needed, but the host session doesn't matter either).
  await page.goto(new URL(url).pathname);
  await expect(page.getByRole("heading", { level: 1, name: "Your guide to Lisbon" })).toBeVisible();
  await page.getByLabel("Your first name (optional)").fill("Ines");
  await page.getByLabel("Arriving").fill("2026-10-24");
  await page.getByLabel("Leaving").fill("2026-10-27");
  await page.getByText("Family", { exact: true }).click();
  await page.getByRole("button", { name: "Start (20 seconds)" }).click();

  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{21}\/quiz$/);
  const token = new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("button", { name: "Skip, surprise me" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${token}$`), { timeout: 30_000 });
  await expect(page.getByText("Hi Ines,")).toBeVisible();

  const { data: guide } = await admin()
    .from("guides")
    .select("source, party_type, check_in, check_out, status")
    .eq("token", token)
    .single();
  expect(guide).toEqual({
    source: "self_serve",
    party_type: "family",
    check_in: "2026-10-24",
    check_out: "2026-10-27",
    status: "ready",
  });

  // The hotel sees the guide in its Guests tab.
  await page.goto(`/host/properties/${propertyId}`);
  const row = page.getByRole("row", { name: /Ines/ });
  await expect(row).toContainText("Self-serve");
  await expect(row).toContainText("Ready");
});

test("self-serve stops at 30 guides an hour, and a disabled link shows a notice", async ({
  page,
}) => {
  host = await signInAsNewHost(page);
  const propertyId = await createDemoProperty(host.id, { name: "Hotel Fabula", type: "hotel" });
  const db = admin();
  const selfServeToken = randomToken();
  await db
    .from("properties")
    .update({ self_serve_token: selfServeToken, self_serve_enabled: true })
    .eq("id", propertyId);
  const { error } = await db.from("guides").insert(
    Array.from({ length: 30 }, () => ({
      property_id: propertyId,
      token: randomToken(),
      source: "self_serve",
    })),
  );
  if (error) throw new Error(error.message);

  await page.goto(`/s/${selfServeToken}`);
  await page.getByRole("button", { name: "Start (20 seconds)" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Lots of guests are starting guides right now." }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/s/${selfServeToken}$`));
  const { count } = await db
    .from("guides")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);
  expect(count).toBe(30);

  // Turned off: the printed link stops working.
  await db.from("properties").update({ self_serve_enabled: false }).eq("id", propertyId);
  await page.goto(`/s/${selfServeToken}`);
  await expect(page.getByRole("heading", { name: "This guide link isn’t active" })).toBeVisible();
});
