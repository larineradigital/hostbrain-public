import { expect, test } from "@playwright/test";

import { signInAsNewHost, type TestHost } from "./helpers/auth";

// Synthetic address suggestion (fictional street), so the test never calls Photon.
const ADDRESS = {
  id: "FIX-ADDR-1",
  label: "Rua da Ficção 7",
  detail: "Lisbon, Portugal",
  address: "Rua da Ficção 7, 1100-000, Lisbon, Portugal",
  city: "Lisbon",
  countryCode: "PT",
  lat: 38.7114,
  lng: -9.1271,
};

let host: TestHost | undefined;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/geo/autocomplete**", (route) =>
    route.fulfill({ json: { items: [ADDRESS] } }),
  );
  // Keep the run hermetic: no map tiles from the network.
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
});

test.afterEach(async () => {
  await host?.cleanup();
  host = undefined;
});

test("guests are sent to login from host pages", async ({ page }) => {
  await page.goto("/host");
  await expect(page).toHaveURL(/\/login\?next=%2Fhost/);
  await expect(page.getByRole("heading", { name: "Sign in to your properties" })).toBeVisible();
});

test("host creates a property and adds two favourite spots (mock Qloo)", async ({ page }) => {
  host = await signInAsNewHost(page);
  await expect(page).toHaveURL(/\/host$/);
  await page.getByRole("link", { name: "Add your first property" }).click();

  await page.getByLabel("Name").fill("Fixture Flat");
  await page.getByText("Apartment", { exact: true }).click();
  await page.getByRole("combobox", { name: "Address" }).fill("Rua da Fic");
  await page.getByRole("option", { name: /Rua da Ficção 7/ }).click();
  await expect(page.getByRole("region", { name: "Property location" })).toBeVisible();
  await page.getByLabel("House notes").fill("Wi-Fi password is on the fridge.");
  await page.getByRole("button", { name: "Save and add favourite spots" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Fixture Flat" })).toBeVisible();
  await expect(page.getByText("No favourite spots yet")).toBeVisible();

  const search = page.getByLabel("Search places near your property");
  await search.fill("Casa");
  await page.getByRole("button", { name: "Choose Casa Marmelo" }).click();
  await page.getByLabel("Your note (optional)").fill("Ask for the quince tart.");
  await page.getByRole("button", { name: "Add to my spots" }).click();
  const spots = page.getByRole("list", { name: "Favourite spots" });
  await expect(spots.getByText("Casa Marmelo")).toBeVisible();
  await expect(spots.getByText("“Ask for the quince tart.”")).toBeVisible();

  await search.fill("Cork");
  await page.getByRole("button", { name: "Choose The Cork Atlas" }).click();
  await page.getByRole("button", { name: "Add to my spots" }).click();
  await expect(spots.getByRole("listitem")).toHaveCount(2);

  // Reorder: The Cork Atlas moves to the top.
  await page.getByRole("button", { name: "Move The Cork Atlas up" }).click();
  await expect(spots.getByRole("listitem").first()).toContainText("The Cork Atlas");

  // Back on the list, the property shows its spots.
  await page.getByRole("link", { name: "Your properties" }).click();
  await expect(page.getByRole("link", { name: /Fixture Flat/ })).toContainText("2 favourite spots");
});
