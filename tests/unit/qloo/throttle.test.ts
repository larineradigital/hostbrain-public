import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Throttle } from "@/lib/qloo/throttle";

import { fakeFetch, liveClient } from "./helpers";

describe("Throttle", () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }));
  afterEach(() => vi.useRealTimers());

  it("spaces starts at 4 per second", async () => {
    const throttle = new Throttle({ ratePerSecond: 4, burst: 1, maxInFlight: 2 });
    const starts: number[] = [];
    const jobs = Array.from({ length: 8 }, async () => {
      const release = await throttle.acquire();
      starts.push(Date.now());
      setTimeout(release, 10);
    });
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all(jobs);

    expect(starts).toHaveLength(8);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(250);
    // Never more than 4 starts in any one-second window.
    for (const start of starts)
      expect(starts.filter((t) => t >= start && t < start + 1000).length).toBeLessThanOrEqual(4);
  });

  it("keeps at most 2 requests in flight", async () => {
    const throttle = new Throttle({ ratePerSecond: 100, burst: 10, maxInFlight: 2 });
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 6 }, async () => {
      const release = await throttle.acquire();
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 300));
      active--;
      release();
    });
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all(jobs);
    expect(peak).toBe(2);
  });

  it("holds new starts while paused", async () => {
    const throttle = new Throttle({ ratePerSecond: 4, burst: 1, maxInFlight: 2 });
    throttle.pauseFor(1000);
    let startedAt = -1;
    const job = throttle.acquire().then((release) => {
      startedAt = Date.now();
      release();
    });
    await vi.advanceTimersByTimeAsync(1500);
    await job;
    expect(startedAt).toBeGreaterThanOrEqual(1000);
  });
});

describe("client rate-limit headers", () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }));
  afterEach(() => vi.useRealTimers());

  it("waits for the window to reset when x-second-ratelimit-remaining hits 0", async () => {
    const fetch = fakeFetch(
      {
        body: { results: [] },
        headers: { "x-second-ratelimit-remaining": "0", "x-second-ratelimit-reset": "1" },
      },
      { body: { results: [] }, headers: { "x-second-ratelimit-remaining": "4" } },
    );
    const { client } = liveClient({ fetch, ratePerSecond: 4 });
    const times: number[] = [];
    const first = client.get("/search", { query: "first" }).then(() => times.push(Date.now()));
    const second = client.get("/search", { query: "second" }).then(() => times.push(Date.now()));
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all([first, second]);

    expect(fetch.calls).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000);
  });
});
