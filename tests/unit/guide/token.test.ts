import { describe, expect, it } from "vitest";

import { isGuideToken, newGuideToken, sameToken } from "@/lib/guide/token";

describe("guide tokens", () => {
  it("are 21 URL-safe characters and unique", () => {
    const tokens = Array.from({ length: 200 }, () => newGuideToken());
    expect(tokens.every(isGuideToken)).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("compare exactly", () => {
    const token = newGuideToken();
    expect(sameToken(token, token)).toBe(true);
    expect(sameToken(token, newGuideToken())).toBe(false);
    expect(sameToken(token, token.slice(0, 20))).toBe(false);
    expect(isGuideToken("short")).toBe(false);
  });
});
