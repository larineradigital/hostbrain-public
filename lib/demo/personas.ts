/**
 * The demo host, properties and guests. All people are fictional. Taste
 * picks are public artists, films and cuisines, resolved through Qloo search when the demo
 * is seeded (`scripts/seed-demo.ts`); host picks are Qloo place searches near each property.
 * Client-safe: no Qloo data lives here, only what we search for.
 */

import type { PartyType } from "@/lib/guide/types";

export const DEMO_HOST = {
  displayName: "Marta (demo host)",
  /** Override with DEMO_HOST_EMAIL (e2e uses its own demo host). */
  defaultEmail: "demo-host@larinera.com",
} as const;

export type DemoPropertyKey = "P1" | "P2" | "P3";
export type DemoGuestKey = "A" | "B" | "C" | "D" | "E";

export interface DemoPropertySpec {
  key: DemoPropertyKey;
  name: string;
  type: "apartment" | "hotel";
  address: string;
  city: string;
  countryCode: string;
  lat: number;
  lng: number;
  description: string;
  houseNotes: string;
  selfServe: boolean;
  /** Searched near the property; the top result becomes a host pick if there is one. */
  picks: ReadonlyArray<{ query: string; note: string }>;
}

export interface DemoGuestSpec {
  key: DemoGuestKey;
  property: DemoPropertyKey;
  firstName: string | null;
  /** How /demo introduces the guest ("Anna & Jonas, from Berlin"), and a short form for tabs. */
  label: string;
  shortLabel: string;
  partyType: PartyType;
  ageBand: string | null;
  artists: readonly string[];
  media: ReadonlyArray<{ title: string; type: "movie" | "tv_show" }>;
  /** `qloo_tag_map` slugs (cuisine and vibe chips). */
  tagLabels: readonly string[];
  /** Dietary chip slugs. */
  dietary: readonly string[];
  skipped: boolean;
  source: "demo" | "self_serve";
}

export const DEMO_PROPERTIES: readonly DemoPropertySpec[] = [
  {
    key: "P1",
    name: "Alfama Sunlight Flat",
    type: "apartment",
    address: "Largo do Chafariz de Dentro, Alfama",
    city: "Lisbon",
    countryCode: "PT",
    lat: 38.7114,
    lng: -9.1271,
    description: "A bright two-room flat on a quiet square, five minutes from the river.",
    houseNotes:
      "Wi-Fi: AlfamaSunlight (password on the fridge)\nCheck-out by 11:00. Leave the keys in the blue bowl.",
    selfServe: false,
    picks: [
      { query: "pastelaria", note: "Go early, while the pastries are still warm." },
      { query: "tasca", note: "Simple Portuguese cooking. Ask for the dish of the day." },
      { query: "miradouro", note: "Best at sunset, with a drink in hand." },
      { query: "fado", note: "Book ahead and stay for the second set." },
      { query: "natural wine", note: "Our favourite glass after a long walk." },
    ],
  },
  {
    key: "P2",
    name: "Galata Rooftop Loft",
    type: "apartment",
    address: "Galata Kulesi Sokak, Beyoğlu",
    city: "Istanbul",
    countryCode: "TR",
    lat: 41.0256,
    lng: 28.9744,
    description: "A loft under the roof, with a terrace that looks across the Golden Horn.",
    houseNotes: "Wi-Fi: GalataLoft (password by the door)\nCheck-out by 11:00.",
    selfServe: false,
    picks: [
      { query: "meyhane", note: "Order meze for the table and take your time." },
      { query: "coffee", note: "Our morning coffee stop." },
      { query: "bookshop", note: "Lovely for a slow browse on a grey afternoon." },
      { query: "jazz", note: "Live sets most nights. Check before you go." },
    ],
  },
  {
    key: "P3",
    name: "The Little Harbour Hotel",
    type: "hotel",
    address: "Cais do Sodré",
    city: "Lisbon",
    countryCode: "PT",
    lat: 38.706,
    lng: -9.145,
    description: "Twelve rooms by the water, with a self-serve guide in every room.",
    houseNotes: "Reception is open 24 hours. Breakfast 7:30–10:30 in the lobby.",
    selfServe: true,
    picks: [
      { query: "market", note: "Come hungry and share a few plates." },
      { query: "seafood", note: "Our pick for fish by the harbour." },
      { query: "rooftop bar", note: "The view at golden hour is worth the stairs." },
    ],
  },
];

export const DEMO_GUESTS: readonly DemoGuestSpec[] = [
  {
    key: "A",
    property: "P1",
    firstName: "Anna",
    label: "Anna & Jonas, from Berlin",
    shortLabel: "Anna & Jonas",
    partyType: "couple",
    ageBand: "30_to_34",
    artists: ["Peggy Gou", "Fred again..", "Bicep"],
    media: [
      { title: "Past Lives", type: "movie" },
      { title: "The Bear", type: "tv_show" },
      { title: "Aftersun", type: "movie" },
    ],
    tagLabels: ["natural_wine", "cosy"],
    dietary: ["vegetarian"],
    skipped: false,
    source: "demo",
  },
  {
    key: "B",
    property: "P1",
    firstName: "Jess",
    label: "The Millers, from Texas",
    shortLabel: "The Millers",
    partyType: "family",
    // One of the six age bands Qloo accepts (lib/qloo/guard.ts AGE_BANDS).
    ageBand: "35_to_44",
    artists: ["Taylor Swift", "Luke Combs"],
    media: [
      { title: "Toy Story", type: "movie" },
      { title: "Bluey", type: "tv_show" },
      { title: "Coco", type: "movie" },
    ],
    // BBQ, burgers and ice cream have no confirmed place tag yet; the family filter and the
    // family Drink section (cafés, ice cream) cover the rest.
    tagLabels: ["family_friendly"],
    dietary: [],
    skipped: false,
    source: "demo",
  },
  {
    key: "C",
    property: "P1",
    firstName: "Kenji",
    label: "Kenji, from Osaka (business)",
    shortLabel: "Kenji",
    partyType: "business",
    ageBand: "45_to_54",
    artists: ["Ryuichi Sakamoto", "Bill Evans"],
    media: [
      { title: "Perfect Days", type: "movie" },
      { title: "Succession", type: "tv_show" },
    ],
    // "Quiet" maps to the cosy vibe chip.
    tagLabels: ["japanese", "coffee", "cosy"],
    dietary: [],
    skipped: false,
    source: "demo",
  },
  {
    key: "D",
    property: "P2",
    firstName: "Selin",
    label: "Selin & friends",
    shortLabel: "Selin & friends",
    partyType: "friends",
    ageBand: "25_to_29",
    artists: ["Dua Lipa", "Tarkan", "Daft Punk"],
    media: [
      { title: "Barbie", type: "movie" },
      { title: "Emily in Paris", type: "tv_show" },
    ],
    tagLabels: ["rooftop", "cocktails", "lively", "street_food"],
    dietary: [],
    skipped: false,
    source: "demo",
  },
  {
    key: "E",
    property: "P3",
    firstName: null,
    label: "Walk-in guests (hotel self-serve)",
    shortLabel: "Walk-in guests",
    partyType: "couple",
    ageBand: null,
    artists: [],
    media: [],
    tagLabels: [],
    dietary: [],
    skipped: true,
    source: "self_serve",
  },
];

/** The headline pair on /demo: same flat, opposite tastes. */
export const DEMO_PAIR = ["A", "B"] as const satisfies readonly DemoGuestKey[];
/** The property "Try as a guest" creates guides on. */
export const DEMO_TRY_PROPERTY: DemoPropertyKey = "P1";

export const demoGuest = (key: DemoGuestKey) => DEMO_GUESTS.find((g) => g.key === key)!;
export const demoProperty = (key: DemoPropertyKey) => DEMO_PROPERTIES.find((p) => p.key === key)!;
