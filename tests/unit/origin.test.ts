import { describe, expect, it } from "vitest";

import { guideUrl, selfServeUrl } from "@/lib/host/qr";
import { publicOrigin, requestOrigin } from "@/lib/origin";

const headers = (init: Record<string, string>) => new Headers(init);

describe("requestOrigin", () => {
  it("uses the proxy's forwarded host and protocol", () => {
    const h = headers({
      host: "web-production-1234.up.railway.app",
      "x-forwarded-host": "hostbrain.larinera.com",
      "x-forwarded-proto": "https, http",
    });
    expect(requestOrigin(h)).toBe("https://hostbrain.larinera.com");
  });

  it("falls back to the Host header, http for localhost", () => {
    expect(requestOrigin(headers({ host: "localhost:3200" }))).toBe("http://localhost:3200");
    expect(requestOrigin(headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(requestOrigin(headers({ host: "example.org" }))).toBe("https://example.org");
  });
});

describe("publicOrigin", () => {
  const local = headers({ host: "localhost:3200" });

  it("uses APP_URL in production, whatever host the request came in on", () => {
    expect(publicOrigin(local, "https://hostbrain.larinera.com")).toBe(
      "https://hostbrain.larinera.com",
    );
    const railway = headers({ host: "web-production-1234.up.railway.app" });
    expect(publicOrigin(railway, "https://hostbrain.larinera.com/")).toBe(
      "https://hostbrain.larinera.com",
    );
  });

  it("keeps only the origin of APP_URL", () => {
    expect(publicOrigin(local, "https://hostbrain.larinera.com/demo?x=1")).toBe(
      "https://hostbrain.larinera.com",
    );
  });

  it("falls back to the request origin without APP_URL or for a localhost APP_URL", () => {
    expect(publicOrigin(local, undefined)).toBe("http://localhost:3200");
    expect(publicOrigin(local, "http://localhost:3000")).toBe("http://localhost:3200");
    expect(publicOrigin(local, "http://127.0.0.1:3000")).toBe("http://localhost:3200");
  });

  it("builds guide and self-serve links on that origin", () => {
    const origin = publicOrigin(local, "https://hostbrain.larinera.com");
    expect(guideUrl(origin, "abc")).toBe("https://hostbrain.larinera.com/g/abc");
    expect(selfServeUrl(origin, "xyz")).toBe("https://hostbrain.larinera.com/s/xyz");
  });
});
