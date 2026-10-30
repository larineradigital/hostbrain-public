import { describe, expect, it } from "vitest";

import { assertSeedTarget } from "@/lib/demo/rules";

import { envFileFor } from "../../scripts/demo-env";

const only =
  (...files: string[]) =>
  (file: string) =>
    files.includes(file);

describe("envFileFor", () => {
  it("loads .env.local locally and requires it", () => {
    expect(envFileFor("local", only(".env.local"))).toBe(".env.local");
    expect(() => envFileFor("local", only())).toThrow(/\.env\.local not found/);
  });

  it("loads .env.production.local for --env production when it exists", () => {
    expect(envFileFor("production", only(".env.production.local", ".env.local"))).toBe(
      ".env.production.local",
    );
  });

  it("falls back to the variables already set without the file (Railway)", () => {
    expect(envFileFor("production", only(".env.local"))).toBeNull();
    expect(envFileFor("production", only())).toBeNull();
  });

  it("never picks .env.local for production", () => {
    expect(envFileFor("production", only(".env.local"))).not.toBe(".env.local");
  });

  it("keeps the hosted-Supabase guard: --env production is still required", () => {
    expect(() => assertSeedTarget("https://abc.supabase.co", "local")).toThrow(/--env production/);
    expect(() => assertSeedTarget("https://abc.supabase.co", "production")).not.toThrow();
  });
});
