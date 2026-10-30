import { expect, test, type Page } from "@playwright/test";

import { COUPLE_GUEST, FAMILY_GUEST } from "../fixtures/concierge-guests";
import { admin, newHostClient } from "./helpers/auth";
import { blockExternal, createDemoProperty, createReadyGuide, randomToken } from "./helpers/guides";

// "AI alone vs. with Qloo" with mock Qloo and the synthetic OpenAI fixture
// (COMPARE_MODE=replay). AI-alone names are text with a status pill, never Qloo cards;
// the comparison is cached per guide, and "generic" counts other guests at the property.

async function aiColumn(page: Page) {
  if (test.info().project.name === "mobile") {
    await page.getByRole("tab", { name: "AI alone" }).click();
  }
  return page.getByRole("list", { name: "AI alone" });
}

test("compare shows measured AI-alone picks next to the Qloo picks", async ({ page, request }) => {
  await blockExternal(page);
  const host = await newHostClient();
  try {
    const propertyId = await createDemoProperty(host.id);
    const couple = await createReadyGuide(propertyId, COUPLE_GUEST, request);
    const family = await createReadyGuide(propertyId, FAMILY_GUEST, request);

    // The guide links to compare in demo mode.
    await page.goto(`/g/${couple.token}`);
    await page.getByRole("link", { name: "Compare: AI alone vs. with Qloo" }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${couple.token}/compare$`));
    await expect(
      page.getByRole("heading", { level: 1, name: "AI alone vs. with Qloo" }),
    ).toBeVisible();

    const summary = page.getByRole("region", { name: "What we measured" });
    await expect(summary).toContainText("AI alone: 6 picks, 3 not found near the property.");
    await expect(summary).toContainText(
      /With Qloo: 6 picks, all verified nearby, \d unique to this guest\./,
    );

    const ai = await aiColumn(page);
    await expect(ai.getByRole("listitem")).toHaveCount(6);
    await expect(ai.getByText("Verified nearby")).toHaveCount(3);
    await expect(ai.getByText("Not found nearby")).toHaveCount(3);
    await expect(
      ai.getByRole("listitem").filter({ hasText: "Harbour Lights Bistro" }),
    ).toContainText("Not found nearby");
    await expect(ai.getByRole("listitem").filter({ hasText: "Casa Marmelo" })).toContainText(
      /Verified nearby.*Qloo found it \d+ m away/,
    );
    // Text labels only: no cards, no "Why this?" for names that didn't come from Qloo.
    await expect(ai.getByRole("article")).toHaveCount(0);
    await expect(ai.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByText("a couple aged 30 to 34 who love Mara Solé", { exact: false }),
    ).toBeVisible();
    // (The guide page we came from may stay in the DOM, hidden, for back navigation.)
    await expect(page.getByText(COUPLE_GUEST.firstName).filter({ visible: true })).toHaveCount(0);

    // With Qloo: the guide's Eat cards, each with provenance.
    if (test.info().project.name === "mobile")
      await page.getByRole("tab", { name: "With Qloo" }).click();
    const qloo = page.getByRole("list", { name: "With Qloo" });
    await expect(qloo.getByRole("article")).toHaveCount(6);
    // Q11 next to the Qloo picks: an aggregate band, never a guess about the guest.
    await expect(page.getByTestId("compare-taste-twins")).toContainText(
      /^People who share this guest’s taste skew (under 25|\d+–\d+|55 and over):/,
    );
    await qloo
      .getByRole("button", { name: /^Why this\?/ })
      .first()
      .click();
    await expect(
      page.getByText(
        "Based on aggregate taste patterns of people with similar interests, not a prediction about you.",
      ),
    ).toBeVisible();

    // Cached: one model call, and reloading doesn't make another.
    const db = admin();
    const calls = async () =>
      (
        await db
          .from("api_log")
          .select("id", { count: "exact", head: true })
          .eq("guide_id", couple.guideId)
          .eq("endpoint", "responses.parse (compare)")
      ).count;
    expect(await calls()).toBe(1);
    await page.reload();
    await expect(summary).toContainText("AI alone: 6 picks");
    expect(await calls()).toBe(1);
    const { data: stored } = await db
      .from("comparisons")
      .select("ai_alone, guest_description")
      .eq("guide_id", couple.guideId)
      .single();
    expect(stored?.ai_alone).toHaveLength(6);
    expect(stored?.guest_description).not.toContain(COUPLE_GUEST.firstName);

    // The second guest shares three AI-alone names with the first: generic.
    await page.goto(`/g/${family.token}/compare`);
    await expect(summary).toContainText(
      "AI alone: 6 picks, 2 not found near the property, 3 also suggested to other guests here.",
    );
    await expect((await aiColumn(page)).getByText("Also suggested to another guest")).toHaveCount(
      3,
    );

    // And the first guest's summary now counts them too.
    await page.goto(`/g/${couple.token}/compare`);
    await expect(summary).toContainText("3 also suggested to other guests here");
  } finally {
    await host.cleanup();
  }
});

test("compare redirects until the guide is ready, and unknown tokens are not found", async ({
  page,
}) => {
  const host = await newHostClient();
  try {
    const propertyId = await createDemoProperty(host.id);
    const token = randomToken();
    await admin().from("guides").insert({ property_id: propertyId, token });
    await page.goto(`/g/${token}/compare`);
    await expect(page).toHaveURL(new RegExp(`/g/${token}$`));
    await page.goto("/g/AAAAAAAAAAAAAAAAAAAAA/compare");
    await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();
  } finally {
    await host.cleanup();
  }
});
