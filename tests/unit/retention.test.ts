import { describe, expect, it } from "vitest";

import {
  CACHE_GRACE_DAYS,
  cacheDeleteBefore,
  isPastRetention,
  RETENTION_DAYS,
  retentionCutoffs,
} from "@/lib/retention";

describe("cacheDeleteBefore", () => {
  it("keeps expired cache rows for 30 days, for replay mode", () => {
    expect(CACHE_GRACE_DAYS).toBe(30);
    expect(cacheDeleteBefore(new Date("2026-11-16T03:00:00Z"))).toBe("2026-10-17T03:00:00.000Z");
    expect(cacheDeleteBefore(new Date("2026-11-16T03:00:00Z"), 0)).toBe("2026-11-16T03:00:00.000Z");
  });
});

describe("retentionCutoffs", () => {
  it("cleans stays that ended 30 or more days ago", () => {
    const cut = retentionCutoffs(new Date("2026-11-30T03:00:00Z"));
    expect(RETENTION_DAYS).toBe(30);
    expect(cut.checkOutOnOrBefore).toBe("2026-10-31");
    expect(cut.createdBefore).toBe("2026-10-31T03:00:00.000Z");
  });

  it("uses the UTC calendar day, whatever the time", () => {
    expect(retentionCutoffs(new Date("2026-11-30T00:00:00Z")).checkOutOnOrBefore).toBe(
      "2026-10-31",
    );
    expect(retentionCutoffs(new Date("2026-11-30T23:59:59Z")).checkOutOnOrBefore).toBe(
      "2026-10-31",
    );
  });

  it("crosses month and year ends", () => {
    expect(retentionCutoffs(new Date("2027-01-15T03:00:00Z")).checkOutOnOrBefore).toBe(
      "2026-12-16",
    );
    expect(retentionCutoffs(new Date("2026-03-01T03:00:00Z")).checkOutOnOrBefore).toBe(
      "2026-01-30",
    );
  });
});

describe("isPastRetention", () => {
  const now = new Date("2026-11-30T03:00:00Z");
  const created = "2026-10-01T10:00:00Z";

  it("keeps a stay until 30 days after check-out", () => {
    expect(isPastRetention({ check_out: "2026-10-31", created_at: created }, now)).toBe(true);
    expect(isPastRetention({ check_out: "2026-11-01", created_at: created }, now)).toBe(false);
    expect(isPastRetention({ check_out: "2026-12-05", created_at: created }, now)).toBe(false);
  });

  it("counts from creation when there is no check-out date", () => {
    expect(isPastRetention({ check_out: null, created_at: "2026-10-31T02:59:00Z" }, now)).toBe(
      true,
    );
    expect(isPastRetention({ check_out: null, created_at: "2026-10-31T03:01:00Z" }, now)).toBe(
      false,
    );
  });

  it("takes a custom number of days", () => {
    expect(isPastRetention({ check_out: "2026-11-23", created_at: created }, now, 7)).toBe(true);
    expect(isPastRetention({ check_out: "2026-11-24", created_at: created }, now, 7)).toBe(false);
  });
});
