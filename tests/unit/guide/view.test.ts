import { describe, expect, it } from "vitest";

import {
  ageBandLabel,
  audienceBandLabel,
  appleMusicSearchUrl,
  displayName,
  displayNamesIn,
  formatStayDates,
  mapsUrl,
  priceSymbols,
  spotifySearchUrl,
} from "@/lib/guide/format";
import { parseHeatmap, parseItems } from "@/lib/guide/view";
import { MOCK_WEATHER, toWeatherReport } from "@/lib/weather";
import { isWetCondition, weatherCondition } from "@/lib/weather-codes";

const item = {
  entity_id: "FIX-P-001",
  name: "Lantern & Ladle",
  category: "Restaurant",
  address: "12 Fable Street",
  lat: 38.7139,
  lng: -9.1394,
  distance_m: 650,
  image_url: null,
  price_level: 2,
  why_you: "People who love Mara Solé tend to love its candlelit room.",
  signals_used: ["Mara Solé"],
  affinity: 0.91,
  explain: [{ entity_id: "FIX-A-001", name: "Mara Solé", score: 0.8 }],
  tags: ["Restaurant"],
};

describe("guide view parsing", () => {
  it("keeps valid items and drops ones that don't match the stored shape", () => {
    const items = parseItems([item, { ...item, entity_id: "" }, { name: "No id" }, null]);
    expect(items.map((i) => i.entity_id)).toEqual(["FIX-P-001"]);
    expect(parseItems("not an array")).toEqual([]);
  });

  it("keeps only well-formed heatmap cells", () => {
    expect(
      parseHeatmap([
        { lat: 1, lng: 2, affinity: 0.5 },
        { lat: "x", lng: 2, affinity: 1 },
      ]),
    ).toEqual([{ lat: 1, lng: 2, affinity: 0.5 }]);
    expect(parseHeatmap(null)).toEqual([]);
  });
});

describe("guide formatting", () => {
  it("shows price levels in the property's currency, euro by default", () => {
    expect(priceSymbols(2, "PT")).toBe("€€");
    expect(priceSymbols(3, "GB")).toBe("£££");
    expect(priceSymbols(1, null)).toBe("€");
    expect(priceSymbols(9, "US")).toBe("$$$$");
  });

  it("formats the stay dates as one range", () => {
    // ICU puts thin spaces around the dash.
    const range = (a: string, b: string) => formatStayDates(a, b)?.replace(/\s/g, " ");
    expect(range("2026-10-24", "2026-10-28")).toBe("24 – 28 Oct");
    expect(range("2026-10-30", "2026-11-02")).toBe("30 Oct – 2 Nov");
    expect(formatStayDates("2026-10-24", null)).toBeNull();
    expect(formatStayDates("2026-10-28", "2026-10-24")).toBeNull();
  });

  it("builds maps and music search links with encoded queries", () => {
    expect(mapsUrl(item, "Lisbon")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Lantern%20%26%20Ladle%2C%2012%20Fable%20Street%2C%20Lisbon",
    );
    expect(mapsUrl({ ...item, address: null }, "Lisbon")).toContain("query=38.7139%2C-9.1394");
    expect(spotifySearchUrl("The Velvet Tides")).toBe(
      "https://open.spotify.com/search/The%20Velvet%20Tides",
    );
    expect(appleMusicSearchUrl("Mara Solé")).toBe(
      "https://music.apple.com/search?term=Mara%20Sol%C3%A9",
    );
    expect(ageBandLabel("25_to_29")).toBe("25 to 29");
    expect(audienceBandLabel("25_to_29")).toBe("25–29");
    expect(audienceBandLabel("24_and_younger")).toBe("under 25");
    expect(audienceBandLabel("55_and_older")).toBe("55 and over");
    expect(audienceBandLabel("someday")).toBeNull();
    expect(audienceBandLabel(null)).toBeNull();
  });

  it("turns Qloo's all-caps names into display casing, keeping styled short names", () => {
    expect(displayName("MARA SOLÉ")).toBe("Mara Solé");
    expect(displayName("THE NIGHT OF THE TRAMS")).toBe("The Night of the Trams");
    expect(displayName("ABBA")).toBe("ABBA");
    expect(displayName("AC/DC")).toBe("AC/DC");
    expect(displayName("DJ KOZE")).toBe("DJ KOZE");
    expect(displayName("Fred again..")).toBe("Fred again..");
    expect(displayName("(LOS) FICTIONALES")).toBe("(Los) Fictionales");
    expect(displayNamesIn("a couple who love MARA SOLÉ, ABBA and The Bear")).toBe(
      "a couple who love Mara Solé, ABBA and The Bear",
    );
  });
});

describe("weather", () => {
  it("maps WMO codes to condition words", () => {
    expect(weatherCondition(0)).toBe("clear");
    expect(weatherCondition(0, false)).toBe("clearNight");
    expect(weatherCondition(2)).toBe("partlyCloudy");
    expect(weatherCondition(45)).toBe("fog");
    expect(weatherCondition(53)).toBe("drizzle");
    expect(weatherCondition(81)).toBe("rain");
    expect(weatherCondition(73)).toBe("snow");
    expect(weatherCondition(95)).toBe("storm");
    expect(isWetCondition("rain")).toBe(true);
    expect(isWetCondition("cloudy")).toBe(false);
  });

  it("reads an Open-Meteo forecast and rejects a malformed one", () => {
    const report = toWeatherReport({
      current: { temperature_2m: 18.4, weather_code: 1, is_day: 1 },
      daily: {
        time: ["2026-10-24", "2026-10-25"],
        weather_code: [3, 61],
        temperature_2m_max: [21.2, 17.6],
        temperature_2m_min: [14.1, 12.5],
      },
    });
    expect(report).toEqual({
      now: { tempC: 18, condition: "clear" },
      days: [
        { date: "2026-10-24", maxC: 21, minC: 14, condition: "cloudy" },
        { date: "2026-10-25", maxC: 18, minC: 13, condition: "rain" },
      ],
    });
    expect(toWeatherReport({ current: {} })).toBeNull();
    expect(MOCK_WEATHER.now.condition).toBe("clear");
  });
});
