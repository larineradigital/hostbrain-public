import { createQlooClient, type QlooClientOptions } from "@/lib/qloo/client";
import { createMemoryQlooStore } from "@/lib/qloo/store";

export const TEST_KEY = "test-key-not-real";

export interface FakeReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A fetch stub that answers from a queue (the last reply repeats) and records URLs and headers. */
export function fakeFetch(...replies: Array<FakeReply | Error>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  let index = 0;
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) } });
    const reply = replies[Math.min(index++, replies.length - 1)] ?? {};
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? { results: [] }), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };
  return Object.assign(fn as typeof fetch, { calls });
}

export function liveClient(overrides: Partial<QlooClientOptions> = {}) {
  const store = createMemoryQlooStore();
  const sleeps: number[] = [];
  const client = createQlooClient({
    mode: "live",
    baseUrl: "https://qloo.test",
    apiKey: TEST_KEY,
    store,
    ratePerSecond: 1000,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...overrides,
  });
  return { client, store: (overrides.store as typeof store | undefined) ?? store, sleeps };
}
