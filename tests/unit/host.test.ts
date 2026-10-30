import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { safeNext } from "@/lib/auth";
import { distanceM, formatDistance, walkingMinutes } from "@/lib/geo/distance";
import { toSuggestion } from "@/lib/geo/photon";
import { propertyInputSchema } from "@/lib/host/schemas";
import { createRateLimiter } from "@/lib/rate-limit";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/host/properties/abc")).toBe("/host/properties/abc");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined])(
    "falls back for %s",
    (value) => {
      expect(safeNext(value)).toBe("/host");
    },
  );
});

describe("createRateLimiter", () => {
  it("allows up to the limit per window, then reports when to retry", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 100).allowed).toBe(true);
    const blocked = limiter.check("ip", 200);
    expect(blocked).toEqual({ allowed: false, retryAfterS: 1 });
    expect(limiter.check("other", 200).allowed).toBe(true);
    expect(limiter.check("ip", 1001).allowed).toBe(true);
  });
});

describe("distance helpers", () => {
  it("measures short city distances", () => {
    const d = distanceM({ lat: 38.7114, lng: -9.1271 }, { lat: 38.7139, lng: -9.1394 });
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1150);
  });
  it("formats metres and kilometres", () => {
    expect(formatDistance(4)).toBe("10 m");
    expect(formatDistance(648)).toBe("650 m");
    expect(formatDistance(1420)).toBe("1.4 km");
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(650)).toBe(9);
  });
});

describe("toSuggestion (Photon)", () => {
  const feature = (properties: Record<string, unknown>) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [-9.1271, 38.7114] },
    properties: { osm_type: "N", osm_id: 1, countrycode: "pt", country: "Portugal", ...properties },
  });

  it("builds an address from street, number and city", () => {
    expect(
      toSuggestion(
        feature({ street: "Rua da Ficção", housenumber: "7", city: "Lisbon", postcode: "1100" }),
      ),
    ).toMatchObject({
      label: "Rua da Ficção 7",
      address: "Rua da Ficção 7, 1100, Lisbon, Portugal",
      city: "Lisbon",
      countryCode: "PT",
      lat: 38.7114,
      lng: -9.1271,
    });
  });

  it("keeps a named place and falls back to district for the city", () => {
    expect(
      toSuggestion(
        feature({ name: "Fixture Hostel", street: "Beco Inventado", district: "Alfama" }),
      ),
    ).toMatchObject({
      label: "Fixture Hostel",
      city: "Alfama",
      address: "Fixture Hostel, Beco Inventado, Alfama, Portugal",
    });
  });

  it("drops features without coordinates or a usable label", () => {
    expect(toSuggestion({ properties: { name: "x" } })).toBeNull();
    expect(toSuggestion(feature({}))).toBeNull();
  });
});

describe("propertyInputSchema", () => {
  const valid = {
    name: " Alfama Flat ",
    type: "apartment",
    address: "Rua da Ficção 7, Lisbon",
    city: "Lisbon",
    countryCode: "pt",
    lat: "38.7114",
    lng: "-9.1271",
    description: "",
    houseNotes: "Check-out 11:00",
  };

  it("trims, coerces coordinates and turns empty text into null", () => {
    expect(propertyInputSchema.parse(valid)).toEqual({
      name: "Alfama Flat",
      type: "apartment",
      address: "Rua da Ficção 7, Lisbon",
      city: "Lisbon",
      countryCode: "PT",
      lat: 38.7114,
      lng: -9.1271,
      description: null,
      houseNotes: "Check-out 11:00",
    });
  });

  it("rejects a missing location and unknown types", () => {
    expect(propertyInputSchema.safeParse({ ...valid, lat: "", lng: "" }).success).toBe(false);
    expect(propertyInputSchema.safeParse({ ...valid, type: "castle" }).success).toBe(false);
  });
});
