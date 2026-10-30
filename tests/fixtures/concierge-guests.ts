/**
 * Two synthetic guests at the same fictional Lisbon flat for the concierge demo questions
 * (lib/demo/personas.ts): B is a family, A a couple. Fixture IDs only. The recorded OpenAI
 * fixture (tests/fixtures/openai/concierge.json) shows IDs that mock Qloo returns for
 * exactly these signals, so the unit test and the e2e test both use them.
 */

export const DEMO_PROPERTY = {
  name: "Fable Street Flat",
  type: "apartment" as const,
  address: "12 Fable Street, Old Harbour",
  city: "Lisbon",
  country_code: "PT",
  lat: 38.7139,
  lng: -9.1394,
  house_notes: "Wi-Fi: FableGuest\nCheck-out by 11:00, keys in the bowl.",
};

export interface DemoGuest {
  firstName: string;
  partyType: "family" | "couple";
  ageBand: string;
  quiz: {
    artist_ids: string[];
    artist_names: string[];
    media_ids: string[];
    media_names: string[];
    tag_urns: string[];
    tag_labels: string[];
    dietary: string[];
  };
}

/** B: "It's raining and the kids are bored." */
export const FAMILY_GUEST: DemoGuest = {
  firstName: "Wren",
  partyType: "family",
  ageBand: "35_to_44",
  quiz: {
    artist_ids: ["FIX-A-008"],
    artist_names: ["Kito & the Kites"],
    media_ids: ["FIX-M-005"],
    media_names: ["Little Kite Rescue"],
    tag_urns: ["urn:tag:ambience:qloo:family_friendly"],
    tag_labels: ["family_friendly"],
    dietary: [],
  },
};

/** A: "Romantic dinner tonight, not too pricey." and "Where can I hear music like Peggy Gou tonight?" */
export const COUPLE_GUEST: DemoGuest = {
  firstName: "Zelda",
  partyType: "couple",
  ageBand: "30_to_34",
  quiz: {
    artist_ids: ["FIX-A-001", "FIX-A-011"],
    artist_names: ["Mara Solé", "Bassline Cartel"],
    media_ids: ["FIX-M-001"],
    media_names: ["A Quiet Tram to Nowhere"],
    tag_urns: ["urn:tag:cuisine:qloo:natural_wine", "urn:tag:ambience:qloo:cozy"],
    tag_labels: ["natural_wine", "cosy"],
    dietary: ["vegetarian"],
  },
};

export const DEMO_QUESTIONS = {
  rainyKids: "It's raining and the kids are bored.",
  romanticDinner: "Romantic dinner tonight, not too pricey.",
  musicTonight: "Where can I hear music like Peggy Gou tonight?",
} as const;
