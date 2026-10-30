import { describe, expect, it } from "vitest";

import { alcoholReason, familyAllows, isAlcoholThemed } from "@/lib/guide/family-filter";

// Synthetic places shaped like Qloo's tags (fictional names, taxonomy URNs only).
const place = (name: string, ...tags: string[]) => ({ name, tags: tags.map((id) => ({ id })) });

const ALCOHOL_SERVED = [
  "urn:tag:offerings:place:alcohol",
  "urn:tag:beverage_offering:qloo:wine",
  "urn:tag:amenity:qloo:bar",
  "urn:tag:amenities:place:bar_onsite",
  "urn:tag:activity_type:qloo:dining_drinking",
];

describe("family filter", () => {
  it("drops places whose genre or category is drinking", () => {
    expect(alcoholReason(place("Golden Hops House", "urn:tag:category:place:brewpub"))).toBe(
      "urn:tag:category:place:brewpub",
    );
    for (const kind of ["bar", "pub", "wine_bar", "cocktail_bar", "wine_cellar", "night_club"]) {
      expect(isAlcoholThemed(place("Somewhere", `urn:tag:genre:place:restaurant:${kind}`))).toBe(
        true,
      );
    }
  });

  it("drops a museum about beer, even with family-friendly tags", () => {
    const museum = place(
      "Museum of Golden Hops",
      "urn:tag:genre:place:museum",
      "urn:tag:ambience:qloo:family_friendly",
      "urn:tag:activity_type:qloo:beer_tasting",
      "urn:tag:interests:qloo:craft_beer_culture",
    );
    expect(alcoholReason(museum)).toBe("urn:tag:activity_type:qloo:beer_tasting");
    expect(familyAllows(museum, { family: true, section: "rainy" })).toBe(false);
  });

  it("drops places styled as bars or drawing a drinks crowd", () => {
    expect(
      isAlcoholThemed(
        place(
          "Tidewater Studio",
          "urn:tag:genre:place:art_gallery",
          "urn:tag:culinary_style:qloo:bar",
        ),
      ),
    ).toBe(true);
    expect(
      isAlcoholThemed(place("Lantern Room", "urn:tag:customer_identity:qloo:cocktail_enthusiasts")),
    ).toBe(true);
    expect(isAlcoholThemed(place("Cellar Door", "urn:tag:interests:qloo:oenology"))).toBe(true);
    expect(isAlcoholThemed(place("After Dark", "urn:tag:activity_type:qloo:nightlife"))).toBe(true);
  });

  it("keeps places that only serve alcohol, and look-alike words", () => {
    const keep = [
      place("Harbour Fish House", "urn:tag:genre:place:restaurant:seafood", ...ALCOHOL_SERVED),
      place("Gallery of Small Things", "urn:tag:genre:place:museum", ...ALCOHOL_SERVED),
      place("Roll & Rice", "urn:tag:genre:place:restaurant:sushi_bar"),
      place("Green Press", "urn:tag:genre:place:restaurant:juice_bar"),
      place(
        "Slow Pour",
        "urn:tag:genre:place:coffee_shop",
        "urn:tag:interests:qloo:slow_coffee_brewing",
      ),
      // In Portugal a café is often a "snack-bar"; "bar" in a name is not enough.
      place("Snack-Bar Estrela", "urn:tag:genre:place:restaurant:cafe"),
      place("Barbecue Barn", "urn:tag:genre:place:restaurant:barbecue"),
      place("Origin Story Museum", "urn:tag:genre:place:museum"),
    ];
    for (const p of keep) expect(alcoholReason(p), p.name).toBeNull();
  });

  it("uses the name only as a backstop, by whole word", () => {
    expect(alcoholReason(place("Museu da Cerveja Imaginária"))).toBe("name:cerveja");
    expect(alcoholReason(place("The Little Wine Room"))).toBe("name:wine");
    expect(alcoholReason(place("Hops Taproom"))).toBe("name:taproom");
    expect(alcoholReason(place("Winestone Toy Museum"))).toBeNull();
  });

  it("applies to families outside Eat only", () => {
    const pub = place("The Anchor", "urn:tag:genre:place:pub");
    expect(familyAllows(pub, { family: true, section: "drink" })).toBe(false);
    expect(familyAllows(pub, { family: true, section: "late_night" })).toBe(false);
    expect(familyAllows(pub, { family: true, section: "eat" })).toBe(true);
    expect(familyAllows(pub, { family: false, section: "drink" })).toBe(true);
  });
});
