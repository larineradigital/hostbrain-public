import { describe, expect, it } from "vitest";

import { CACHE_TTL_MS, createQlooClient, qlooCacheKey } from "@/lib/qloo/client";
import { QlooError } from "@/lib/qloo/errors";
import { QlooGuardError } from "@/lib/qloo/guard";
import { createMemoryQlooStore } from "@/lib/qloo/store";

import { TEST_KEY, fakeFetch, liveClient } from "./helpers";

const PLACES = { "filter.type": "urn:entity:place", "filter.location": "POINT(-9.1394 38.7139)" };

describe("retries", () => {
  it("retries 429 and 5xx twice with backoff, then succeeds", async () => {
    const fetch = fakeFetch({ status: 429 }, { status: 503 }, { body: { results: [] } });
    const { client, store, sleeps } = liveClient({ fetch });
    const result = await client.get("/search", { query: "peggy" });

    expect(result.cacheHit).toBe(false);
    expect(fetch.calls).toHaveLength(3);
    expect(sleeps).toEqual([1000, 1500]); // 429 waits for the window (1 s default) or the backoff, whichever is longer
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({ status: 200, attempts: 3, cacheHit: false });
  });

  it("uses the plain backoff for 5xx", async () => {
    const fetch = fakeFetch({ status: 500 }, { status: 502 }, { body: { results: [] } });
    const { client, sleeps } = liveClient({ fetch });
    await client.get("/search", { query: "peggy" });
    expect(sleeps).toEqual([500, 1500]);
  });

  it("gives up after 2 retries with a clear error and logs it", async () => {
    const fetch = fakeFetch({ status: 503, body: { message: "upstream down" } });
    const { client, store } = liveClient({ fetch });
    const error = await client.get("/search", { query: "peggy" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QlooError);
    expect(error).toMatchObject({ kind: "http", status: 503, attempts: 3 });
    expect((error as Error).message).toContain("upstream down");
    expect(fetch.calls).toHaveLength(3);
    expect(store.logs[0]).toMatchObject({
      status: 503,
      attempts: 3,
      error: expect.stringContaining("503"),
    });
    expect(store.cache.size).toBe(0);
  });

  it("does not retry other 4xx errors", async () => {
    const fetch = fakeFetch({ status: 400, body: { errors: "invalid age" } });
    const { client } = liveClient({ fetch });
    await expect(client.get("/search", { query: "peggy" })).rejects.toMatchObject({
      kind: "http",
      status: 400,
    });
    expect(fetch.calls).toHaveLength(1);
  });

  it("retries network errors", async () => {
    const fetch = fakeFetch(new TypeError("fetch failed"), { body: { results: [] } });
    const { client, sleeps } = liveClient({ fetch });
    await client.get("/search", { query: "peggy" });
    expect(fetch.calls).toHaveLength(2);
    expect(sleeps).toEqual([500]);
  });

  it("a call budget skips retries that can't finish in time", async () => {
    const fetch = fakeFetch({ status: 503, body: { message: "upstream down" } });
    const { client, sleeps } = liveClient({ fetch });
    const error = await client
      .get("/search", { query: "peggy" }, { budgetMs: 400 })
      .catch((e: unknown) => e);
    // The first backoff (500 ms) would end past the budget: the 503 comes back at once.
    expect(error).toMatchObject({ kind: "http", status: 503, attempts: 1 });
    expect(fetch.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("a call budget cuts off a hanging request", async () => {
    let calls = 0;
    const hanging = ((_url: string, init?: RequestInit) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    }) as typeof fetch;
    const { client, store } = liveClient({ fetch: hanging });
    const started = Date.now();
    const error = await client
      .get("/search", { query: "peggy" }, { budgetMs: 80 })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "network" });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(calls).toBe(1);
    expect(store.logs[0]).toMatchObject({ status: null, cacheHit: false });
  });

  it("logs the monthly quota left", async () => {
    const fetch = fakeFetch({
      body: { results: [] },
      headers: { "x-month-ratelimit-remaining": "9876" },
    });
    const { client, store } = liveClient({ fetch });
    await client.get("/search", { query: "peggy" });
    expect(store.logs[0].monthRemaining).toBe(9876);
  });
});

describe("cache", () => {
  it("serves the second identical call from the cache, whatever the param order", async () => {
    const fetch = fakeFetch({ body: { results: { entities: [] } } });
    const { client, store } = liveClient({ fetch });
    const signals = { "signal.interests.entities": ["FIX-A-002", "FIX-A-001"] };

    const first = await client.get("/v2/insights", { ...PLACES, ...signals }, { guideId: "g-1" });
    const second = await client.get("/v2/insights", {
      "signal.interests.entities": "FIX-A-001,FIX-A-002",
      "filter.location": PLACES["filter.location"],
      "filter.type": PLACES["filter.type"],
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(fetch.calls).toHaveLength(1);
    expect(store.logs.map((log) => log.cacheHit)).toEqual([false, true]);
    expect(store.logs[0].guideId).toBe("g-1");
  });

  it("lower-cases search text for the cache key only", async () => {
    const fetch = fakeFetch({ body: { results: [] } });
    const { client } = liveClient({ fetch });
    await client.get("/search", { query: "Peggy Gou" });
    const again = await client.get("/search", { query: "peggy  gou" });
    expect(again.cacheHit).toBe(true);
    expect(fetch.calls[0].url).toContain("query=Peggy+Gou");
  });

  it("uses the TTL per endpoint", async () => {
    let now = 1_000_000;
    const fetch = fakeFetch({ body: { results: [] } });
    const { client, store } = liveClient({ fetch, now: () => now });
    await client.get("/search", { query: "bicep" });
    await client.get("/v2/tags", { "filter.query": "wine" });
    await client.get("/v2/insights", PLACES);

    const ttl = (endpoint: string) =>
      [...store.cache.values()].find((entry) => entry.endpoint === endpoint)!.expiresAt.getTime() -
      now;
    expect(ttl("/search")).toBe(24 * 3600_000);
    expect(ttl("/v2/tags")).toBe(24 * 3600_000);
    expect(ttl("/v2/insights")).toBe(72 * 3600_000);
    expect(CACHE_TTL_MS["/v2/insights"]).toBe(72 * 3600_000);

    now += 24 * 3600_000 + 1;
    expect((await client.get("/search", { query: "bicep" })).cacheHit).toBe(false);
    expect((await client.get("/v2/insights", PLACES)).cacheHit).toBe(true);
  });

  it("drops akas before caching", async () => {
    const body = {
      results: [
        { entity_id: "FIX-1", name: "X", properties: { akas: [{ value: "Y" }], address: "1 St" } },
      ],
    };
    const fetch = fakeFetch({ body });
    const { client, store } = liveClient({ fetch });
    const result = await client.get("/search", { query: "x" });
    const cached = [...store.cache.values()][0].response;
    expect(JSON.stringify(cached)).not.toContain("akas");
    expect(JSON.stringify(result.data)).not.toContain("akas");
    expect(JSON.stringify(cached)).toContain("1 St");
  });

  it("keeps the key out of logs and cache, and sends it only as a header", async () => {
    const fetch = fakeFetch({ body: { results: [] } });
    const { client, store } = liveClient({ fetch });
    await client.get("/search", { query: "bicep" });
    expect(fetch.calls[0].headers["X-Api-Key"]).toBe(TEST_KEY);
    expect(fetch.calls[0].url).not.toContain(TEST_KEY);
    expect(JSON.stringify(store.logs)).not.toContain(TEST_KEY);
    expect(JSON.stringify([...store.cache.entries()])).not.toContain(TEST_KEY);
  });

  it("builds stable cache keys", () => {
    expect(qlooCacheKey("/search", { query: "A", types: "urn:entity:artist" })).toBe(
      qlooCacheKey("/search", { types: "urn:entity:artist", query: "a" }),
    );
    expect(qlooCacheKey("/search", { query: "a" })).not.toBe(
      qlooCacheKey("/v2/tags", { query: "a" }),
    );
  });
});

describe("modes", () => {
  it("replay serves expired cache entries and never calls the API", async () => {
    let now = 0;
    const store = createMemoryQlooStore();
    const seed = liveClient({ fetch: fakeFetch({ body: { results: [] } }), store, now: () => now });
    await seed.client.get("/search", { query: "bicep" });

    now += 30 * 24 * 3600_000;
    const fetch = fakeFetch({ status: 500 });
    const replay = createQlooClient({
      mode: "replay",
      baseUrl: "https://qloo.test",
      store,
      fetch,
      now: () => now,
    });
    expect((await replay.get("/search", { query: "bicep" })).cacheHit).toBe(true);
    await expect(replay.get("/search", { query: "unknown" })).rejects.toMatchObject({
      kind: "replay_miss",
    });
    expect(fetch.calls).toHaveLength(0);
  });

  it("live mode without a key fails clearly instead of faking data", async () => {
    const fetch = fakeFetch({ body: { results: [] } });
    const { client } = liveClient({ fetch, apiKey: undefined });
    await expect(client.get("/search", { query: "bicep" })).rejects.toMatchObject({
      kind: "config",
    });
    expect(fetch.calls).toHaveLength(0);
  });

  it("mock mode never calls fetch and logs the call", async () => {
    const fetch = fakeFetch({ status: 500 });
    const store = createMemoryQlooStore();
    const client = createQlooClient({ mode: "mock", baseUrl: "https://qloo.test", store, fetch });
    const result = await client.get("/search", { query: "velvet", types: "urn:entity:artist" });
    expect(fetch.calls).toHaveLength(0);
    expect(result.mode).toBe("mock");
    expect(store.logs[0]).toMatchObject({ mode: "mock", endpoint: "/search", cacheHit: false });
  });

  it("runs the guard before anything else", async () => {
    const fetch = fakeFetch({ body: { results: [] } });
    const { client, store } = liveClient({ fetch });
    await expect(client.get("/search", { query: "guest@example.com" })).rejects.toBeInstanceOf(
      QlooGuardError,
    );
    await expect(
      client.get(
        "/v2/insights",
        { ...PLACES, "signal.location.query": "Ana's flat" },
        { forbiddenTerms: ["Ana"] },
      ),
    ).rejects.toBeInstanceOf(QlooGuardError);
    expect(fetch.calls).toHaveLength(0);
    expect(store.logs).toHaveLength(0);
  });
});
