import { describe, expect, it } from "vitest";

import { newGuideSchema } from "@/lib/guide/new-guide";
import { SELF_SERVE_LIMIT, selfServeQuota } from "@/lib/guide/self-serve";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("selfServeQuota", () => {
  it("allows 30 guides per property per hour", () => {
    expect(SELF_SERVE_LIMIT).toEqual({ limit: 30, windowMs: 3_600_000 });
    const recent = Array.from({ length: 29 }, (_, i) => minutesAgo(i));
    expect(selfServeQuota(recent, NOW)).toEqual({ allowed: true, remaining: 1, retryAfterS: 0 });
  });

  it("blocks the 31st and says when the oldest one leaves the window", () => {
    // 30 guides, the oldest 50 minutes ago: room again in 10 minutes.
    const recent = [minutesAgo(50), ...Array.from({ length: 29 }, (_, i) => minutesAgo(i))];
    expect(selfServeQuota(recent, NOW)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterS: 600,
    });
  });

  it("ignores guides older than an hour", () => {
    const recent = [
      ...Array.from({ length: 40 }, () => minutesAgo(61)),
      ...Array.from({ length: 5 }, () => minutesAgo(5)),
    ];
    expect(selfServeQuota(recent, NOW)).toMatchObject({ allowed: true, remaining: 25 });
  });

  it("counts a guide exactly an hour old as outside the window", () => {
    const recent = Array.from({ length: 30 }, () => minutesAgo(60));
    expect(selfServeQuota(recent, NOW).allowed).toBe(true);
  });

  it("waits for the right guide when more than the limit are in the window", () => {
    // 32 in the window (a race let two extra through): the 3rd oldest decides.
    const recent = [minutesAgo(59), minutesAgo(58), minutesAgo(40)].concat(
      Array.from({ length: 29 }, () => minutesAgo(1)),
    );
    expect(selfServeQuota(recent, NOW).retryAfterS).toBe(20 * 60);
  });
});

describe("newGuideSchema", () => {
  const base = { firstName: "", checkIn: "", checkOut: "", partyType: "couple", ageBand: "" };

  it("turns empty fields into nulls", () => {
    expect(newGuideSchema.parse(base)).toEqual({
      firstName: null,
      checkIn: null,
      checkOut: null,
      partyType: "couple",
      ageBand: null,
    });
  });

  it("rejects check-out before check-in, unknown party types and age bands", () => {
    const result = newGuideSchema.safeParse({
      ...base,
      checkIn: "2026-10-28",
      checkOut: "2026-10-24",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["checkOut"]);
    expect(newGuideSchema.safeParse({ ...base, partyType: "crowd" }).success).toBe(false);
    expect(newGuideSchema.safeParse({ ...base, ageBand: "35_and_younger" }).success).toBe(false);
    expect(newGuideSchema.safeParse({ ...base, checkIn: "2026-02-31" }).success).toBe(false);
  });
});
