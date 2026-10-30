import { expect, test } from "@playwright/test";

import { admin, signInAsNewHost, type TestHost } from "./helpers/auth";
import { blockExternal, createDemoProperty, randomToken } from "./helpers/guides";

// The host's property page and the A6 print card. Guests table with status,
// viewed and question counts; "New guest guide" with link, QR and the fill-the-quiz option.

let host: TestHost | undefined;

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

test.afterEach(async () => {
  await host?.cleanup();
  host = undefined;
});

test("host creates a guest guide, sees it in the table and prints its card", async ({ page }) => {
  host = await signInAsNewHost(page);
  const propertyId = await createDemoProperty(host.id);

  // An existing guest who viewed the guide and asked the concierge two questions.
  const db = admin();
  const { data: seen } = await db
    .from("guides")
    .insert({
      property_id: propertyId,
      token: randomToken(),
      guest_first_name: "Mira",
      status: "ready",
      viewed_at: "2026-10-25T09:00:00Z",
      check_in: "2026-10-24",
      check_out: "2026-10-28",
    })
    .select("id")
    .single();
  await db.from("chat_messages").insert([
    { guide_id: seen!.id, role: "user", content: { text: "Rainy day plan" } },
    { guide_id: seen!.id, role: "assistant", content: { text: "Try these.", cards: [], seen: [] } },
    { guide_id: seen!.id, role: "user", content: { text: "Dinner for two tonight" } },
  ]);

  await page.goto(`/host/properties/${propertyId}`);
  await expect(page.getByRole("tab", { name: "Guests (1)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const mira = page.getByRole("row", { name: /Mira/ });
  await expect(mira).toContainText("24 – 28 Oct");
  await expect(mira).toContainText("Ready");
  await expect(mira).toContainText("25 Oct");
  // Questions: the guest's two messages, not the concierge's reply.
  await expect(mira.getByRole("cell").nth(3)).toHaveText("2");

  // New guest guide → link and QR in the dialog.
  await page.getByRole("button", { name: "New guest guide" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Guest's first name (optional)").fill("Theo");
  await dialog.getByLabel("Check-in").fill("2026-11-02");
  await dialog.getByLabel("Check-out").fill("2026-11-01");
  await dialog.getByText("Friends", { exact: true }).click();
  await dialog.getByRole("button", { name: "Create guide" }).click();
  await expect(dialog.getByText("Check-out can't be before check-in")).toBeVisible();
  await dialog.getByLabel("Check-out").fill("2026-11-05");
  await dialog.getByLabel("Age group (optional)").selectOption("25_to_29");
  await dialog.getByRole("button", { name: "Create guide" }).click();
  await expect(dialog.getByRole("heading", { name: "Guide created" })).toBeVisible();
  await expect(dialog.getByTestId("new-guide-url")).toHaveText(/\/g\/[A-Za-z0-9_-]{21}$/);
  await expect(dialog.getByRole("img", { name: "QR code for the new guide" })).toBeVisible();
  await page.keyboard.press("Escape");

  const theo = page.getByRole("row", { name: /Theo/ });
  await expect(theo).toContainText("Waiting for quiz");
  await expect(theo).toContainText("2 – 5 Nov");
  await expect(theo).toContainText("Not yet");
  const { data: created } = await db
    .from("guides")
    .select("id, token, source, party_type, age_band")
    .eq("property_id", propertyId)
    .eq("guest_first_name", "Theo")
    .single();
  expect(created).toMatchObject({ source: "host", party_type: "friends", age_band: "25_to_29" });

  // QR dialog: the SVG is served to the host only.
  await theo.getByRole("button", { name: "QR code for Theo" }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: /QR code/ })).toBeVisible();
  const qr = await page.request.get(`/host/guides/${created!.id}/qr`);
  expect(qr.status()).toBe(200);
  expect(qr.headers()["content-type"]).toContain("image/svg+xml");
  const anonymous = await page.context().browser()!.newContext();
  expect(
    (
      await anonymous.request.get(`${page.url().split("/host")[0]}/host/guides/${created!.id}/qr`)
    ).status(),
  ).toBe(401);
  await anonymous.close();
  await page.keyboard.press("Escape");

  // H5 print card: A6, QR, city and property; the host header doesn't print.
  await theo.getByRole("link", { name: "Print card for Theo" }).click();
  await expect(page).toHaveURL(new RegExp(`/host/guides/${created!.id}/print$`));
  const printCard = page.getByRole("article", { name: "Print card" });
  await expect(
    printCard.getByRole("heading", { name: "Your personal guide to Lisbon" }),
  ).toBeVisible();
  await expect(printCard).toContainText("Scan to get places picked for your taste");
  await expect(printCard).toContainText("Fable Street Flat");
  await expect(printCard.locator("svg")).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Host Brain" })).toBeHidden();
  const size = await printCard.boundingBox();
  // 105 × 148 mm at 96 dpi.
  expect(Math.round(size!.width)).toBe(397);
  expect(Math.round(size!.height)).toBe(559);
});

test("“Fill the quiz for them” takes the host to the guest's quiz", async ({ page }) => {
  host = await signInAsNewHost(page);
  const propertyId = await createDemoProperty(host.id);
  await page.goto(`/host/properties/${propertyId}`);
  await page.getByRole("button", { name: "New guest guide" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Guest's first name (optional)").fill("Noor");
  await dialog.getByLabel(/Fill the quiz for them/).check();
  await dialog.getByRole("button", { name: "Create guide" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{21}\/quiz$/);
  await expect(page.getByRole("heading", { name: "Music you love" })).toBeVisible();
});
