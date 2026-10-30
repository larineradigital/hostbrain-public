import { createQlooClient, type QlooClient } from "@/lib/qloo/client";
import { createMemoryQlooStore } from "@/lib/qloo/store";
import type { GenerationResult, GuideContext, GuideStore, LlmLogEntry } from "@/lib/guide/store";

export const GUIDE_ID = "00000000-0000-4000-8000-000000000001";
export const GUEST_NAME = "Zelda";

/** A Lisbon guest with synthetic fixture picks (FIX- IDs). */
export function guideContext(overrides: Partial<GuideContext> = {}): GuideContext {
  return {
    guide: {
      id: GUIDE_ID,
      token: "tok_abcdefghijklmnopq",
      status: "awaiting_quiz",
      partyType: "couple",
      ageBand: "30_to_34",
      guestFirstName: GUEST_NAME,
    },
    property: {
      id: "00000000-0000-4000-8000-0000000000aa",
      name: "Fable Street Flat",
      type: "apartment",
      address: "12 Fable Street, Old Harbour",
      city: "Lisbon",
      lat: 38.7139,
      lng: -9.1394,
    },
    quiz: {
      artistIds: ["FIX-A-001", "FIX-A-002"],
      artistNames: ["Mara Solé", "The Velvet Tides"],
      mediaIds: ["FIX-M-001"],
      mediaNames: ["A Quiet Tram to Nowhere"],
      tagUrns: ["urn:tag:cuisine:qloo:natural_wine", "urn:tag:ambience:qloo:cozy"],
      tagLabels: ["natural_wine", "Cosy"],
      dietary: ["vegetarian"],
      skipped: false,
    },
    hostPicks: [],
    ...overrides,
  };
}

export interface MemoryGuideStore extends GuideStore {
  saved: GenerationResult | null;
  failed: string | null;
  llmLogs: LlmLogEntry[];
  claims: number;
}

export function memoryGuideStore(
  context: GuideContext | null = guideContext(),
  { busy = false } = {},
): MemoryGuideStore {
  const store: MemoryGuideStore = {
    saved: null,
    failed: null,
    llmLogs: [],
    claims: 0,
    async load() {
      return context;
    },
    async claim() {
      store.claims++;
      return !busy;
    },
    async saveResult(_id, result) {
      store.saved = result;
    },
    async markFailed(_id, message) {
      store.failed = message;
    },
    async logLlm(entry) {
      store.llmLogs.push(entry);
    },
  };
  return store;
}

/** The mock Qloo client, recording every response so tests can check where IDs came from. */
export function mockQloo() {
  const store = createMemoryQlooStore();
  const responses: unknown[] = [];
  const inner = createQlooClient({
    mode: "mock",
    baseUrl: "https://qloo.test",
    store,
    ratePerSecond: 1000,
    burst: 10,
  });
  const client: QlooClient = {
    mode: inner.mode,
    async get(path, params, context) {
      const result = await inner.get(path, params, context);
      responses.push(result.data);
      return result;
    },
  };
  return { client, store, responses };
}
