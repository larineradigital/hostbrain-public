import { describe, expect, it } from "vitest";

import { DEFAULT_OPENAI_MODEL, readServerEnv } from "@/lib/env";

describe("readServerEnv", () => {
  it("defaults to mock mode without a Qloo key", () => {
    const env = readServerEnv({ QLOO_API_KEY: "" });
    expect(env.QLOO_MODE).toBe("mock");
    expect(env.LLM_PROVIDER).toBe("openai");
    expect(env.OPENAI_MODEL).toBe(DEFAULT_OPENAI_MODEL);
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.QLOO_BASE_URL).toBe("https://hackathon.api.qloo.com");
    expect(env.DEMO_MODE).toBe(false);
  });

  it("defaults to live mode when a Qloo key is set", () => {
    const env = readServerEnv({ QLOO_API_KEY: "test-key" });
    expect(env.QLOO_MODE).toBe("live");
  });

  it("respects an explicit mode", () => {
    const env = readServerEnv({
      QLOO_API_KEY: "test-key",
      QLOO_MODE: "replay",
      DEMO_MODE: "true",
    });
    expect(env.QLOO_MODE).toBe("replay");
    expect(env.DEMO_MODE).toBe(true);
  });

  it("takes the OpenAI model from the environment and rejects an unknown provider", () => {
    expect(readServerEnv({ OPENAI_MODEL: "gpt-6-luna" }).OPENAI_MODEL).toBe("gpt-6-luna");
    expect(readServerEnv({ OPENAI_MODEL: "" }).OPENAI_MODEL).toBe(DEFAULT_OPENAI_MODEL);
    expect(() => readServerEnv({ LLM_PROVIDER: "anthropic" })).toThrow();
  });

  it("rejects an unknown mode", () => {
    expect(() => readServerEnv({ QLOO_MODE: "fake" })).toThrow();
  });
});
