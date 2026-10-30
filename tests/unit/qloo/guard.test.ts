import { describe, expect, it } from "vitest";

import { AGE_BANDS, QlooGuardError, guardParams } from "@/lib/qloo/guard";

const rejects = (fn: () => unknown, reason: RegExp) => {
  expect(fn).toThrow(QlooGuardError);
  expect(fn).toThrow(reason);
};

describe("guardParams", () => {
  it("accepts the confirmed live formats and normalises lists", () => {
    expect(
      guardParams("/v2/insights", {
        "filter.type": "urn:entity:place",
        "filter.location": "POINT(-9.1394 38.7139)",
        "filter.location.radius": 2000,
        "filter.tags": [
          "urn:tag:genre:place:restaurant:wine_bar",
          "urn:tag:genre:place:restaurant",
        ],
        "signal.interests.entities": ["B-2", "A-1", "B-2"],
        "signal.demographics.age": "30_to_34",
        "feature.explainability": true,
        take: 20,
        "filter.price_level.max": undefined,
      }),
    ).toEqual({
      "feature.explainability": "true",
      "filter.location": "POINT(-9.1394 38.7139)",
      "filter.location.radius": "2000",
      "filter.tags": "urn:tag:genre:place:restaurant,urn:tag:genre:place:restaurant:wine_bar",
      "filter.type": "urn:entity:place",
      "signal.demographics.age": "30_to_34",
      "signal.interests.entities": "A-1,B-2",
      take: "20",
    });

    expect(
      guardParams("/search", {
        query: "pastelaria",
        types: "urn:entity:place",
        "filter.location": "38.7139,-9.1394",
        "filter.radius": 2,
      }),
    ).toMatchObject({ "filter.location": "38.7139,-9.1394", "filter.radius": "2" });
  });

  it("rejects parameters outside the allow-list", () => {
    rejects(() => guardParams("/search", { query: "x", guest_name: "Ana" }), /allow-list/);
    rejects(() => guardParams("/v2/tags", { query: "wine" }), /allow-list/);
    rejects(() => guardParams("/v2/insights", { "signal.interests.emails": "a" }), /allow-list/);
    rejects(() => guardParams("/v1/other" as "/search", { query: "x" }), /not an allowed endpoint/);
  });

  it("rejects emails, phone numbers, booking numbers and URLs", () => {
    rejects(() => guardParams("/search", { query: "ana@example.com" }), /email/);
    rejects(() => guardParams("/search", { query: "+351 912 345 678" }), /phone or booking/);
    rejects(() => guardParams("/search", { query: "HMABC1234567" }), /phone or booking/);
    rejects(() => guardParams("/v2/tags", { "filter.query": "see https://x.y" }), /URL/);
  });

  it("rejects free text over 40 characters, except search queries", () => {
    const long = "a quiet wine bar with natural wine and vinyl";
    expect(long.length).toBeGreaterThan(40);
    rejects(() => guardParams("/v2/tags", { "filter.query": long }), /longer than 40/);
    rejects(() => guardParams("/v2/insights", { "filter.location.query": long }), /longer than 40/);
    rejects(() => guardParams("/v2/insights", { "signal.location.query": long }), /longer than 40/);
    expect(guardParams("/search", { query: long }).query).toBe(long);
    rejects(() => guardParams("/search", { query: long.repeat(3) }), /longer than 80/);
  });

  it("rejects the guest's name anywhere in the params", () => {
    const options = { forbiddenTerms: ["Ana", "  "] };
    rejects(() => guardParams("/search", { query: "Ana's favourite bar" }, options), /forbidden/);
    rejects(() => guardParams("/v2/tags", { "filter.query": "ANA" }, options), /forbidden/);
    // Whole words only: "banana" is fine.
    expect(guardParams("/search", { query: "banana bread" }, options).query).toBe("banana bread");
  });

  it("validates IDs, URNs, locations, ranges and age bands", () => {
    rejects(
      () => guardParams("/v2/insights", { "signal.interests.entities": "Ana Silva" }),
      /entity ID/,
    );
    rejects(() => guardParams("/v2/insights", { "signal.interests.entities": [] }), /one or more/);
    rejects(() => guardParams("/v2/insights", { "filter.tags": "restaurant" }), /tag URN/);
    rejects(
      () => guardParams("/v2/insights", { "filter.type": "urn:entity:person" }),
      /expected one of/,
    );
    rejects(() => guardParams("/v2/insights", { "filter.location": "38.7139,-9.1394" }), /POINT/);
    rejects(() => guardParams("/v2/insights", { "filter.location": "POINT(-9.1 138.7)" }), /POINT/);
    rejects(
      () => guardParams("/search", { "filter.location": "POINT(-9.1394 38.7139)" }),
      /lat,lon/,
    );
    rejects(() => guardParams("/search", { "filter.radius": 101 }), /1 to 100/);
    rejects(() => guardParams("/v2/insights", { "filter.location.radius": 1.5 }), /integer/);
    rejects(() => guardParams("/v2/insights", { take: 500 }), /1 to 50/);
    rejects(
      () => guardParams("/v2/insights", { "signal.demographics.age": "36_to_45" }),
      /expected one of/,
    );
    for (const band of AGE_BANDS) {
      expect(guardParams("/v2/insights", { "signal.demographics.age": band })).toBeTruthy();
    }
    rejects(
      () =>
        guardParams("/v2/insights", {
          "signal.interests.entities": Array.from({ length: 51 }, (_, i) => `E${i}`),
        }),
      /more than 50/,
    );
  });
});
