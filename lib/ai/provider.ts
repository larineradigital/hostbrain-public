import "server-only";

import type { z } from "zod";

import { readServerEnv } from "@/lib/env";

/**
 * The thin seam between Host Brain and the LLM vendor. The writer, the
 * concierge and the comparison only see this interface; `LLM_PROVIDER` picks the
 * implementation (OpenAI's Responses API is the only one today, lib/ai/openai.ts).
 * Qloo picks every recommendation; the model only explains, ranks and talks.
 */

export type LlmProviderName = "openai";
export type Effort = "low" | "medium" | "high";

/** Token counts for one model call. Never prompts, outputs or keys. */
export interface LlmUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
}

/** What one model call reports back, for api_log. */
export interface LlmCall {
  /** The model that answered (a dated snapshot of the requested one). */
  servedBy: string;
  /** "completed", "refusal", or why it stopped early ("max_output_tokens", "content_filter"). */
  stopReason: string;
  usage: LlmUsage;
}

/** A failed call: `status` is the HTTP status, or null for timeouts and network errors. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface StructuredRequest<T> {
  /** Name of the output schema, visible to the model. */
  name: string;
  schema: z.ZodType<T>;
  /** Byte-stable instructions, so the prompt prefix can be cached. */
  instructions: string;
  input: string;
  effort: Effort;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

/** `output` is null when the model refused, was cut off or returned nothing parsable. */
export interface StructuredResult<T> {
  output: T | null;
  call: LlmCall;
}

export interface AgentTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  /** Validates the model's arguments; a bad input goes back to the model as an error. */
  schema: S;
  /** The strict JSON Schema the model sees (lib/ai/tools.ts `strictSchema`). */
  parameters: Record<string, unknown>;
  /** Returns the tool result as text. A throw goes back to the model as an error result. */
  run(input: z.infer<S>): Promise<string>;
}

export interface AgentMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AgentStep {
  /** 1-based model call number within this turn. */
  iteration: number;
  call: LlmCall;
  /** Visible text of this step, as finally returned. */
  text: string;
  /** Tools the model called in this step. */
  tools: string[];
  latencyMs: number;
}

export interface AgentRequest {
  /** Byte-stable instructions; with the tools, the cached prefix. */
  instructions: string;
  /** Per-turn context (the stay, today, the guide), sent after the cached prefix. */
  context: string;
  /** Earlier turns as text, then the guest's new message last. */
  messages: AgentMessage[];
  /** Fixed order, so the prompt cache holds. */
  tools: AgentTool[];
  effort: Effort;
  /** Most model calls in one turn; tool calls of the last one still run. */
  maxIterations: number;
  maxOutputTokens: number;
  signal?: AbortSignal;
  /** Streamed visible text of the current step. */
  onText: (delta: string, iteration: number) => void;
  /** After every model call, before its tools run. */
  onStep: (step: AgentStep) => void | Promise<void>;
  /**
   * Called when the model stops without calling a tool. A returned text is sent as a
   * developer message and the loop goes on (while calls remain); null ends the turn.
   */
  onFinish?: () => string | null;
}

export interface AgentResult {
  iterations: number;
  /** The last call's stop reason, or null when no call finished. */
  stopReason: string | null;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  readonly model: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
  /** The tool loop. Throws LlmError when a call fails. */
  runAgent(request: AgentRequest): Promise<AgentResult>;
}

/** Status and a short message for api_log, from any error. */
export function describeLlmError(error: unknown): { status: number | null; message: string } {
  if (error instanceof LlmError)
    return { status: error.status, message: error.message.slice(0, 300) };
  const message =
    error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown error";
  return { status: null, message };
}

export type LlmPurpose = "writer" | "concierge" | "compare";

const providers = new Map<LlmPurpose, LlmProvider | null>();

/**
 * The provider for one job, or null without an API key (mock runs: template lines, the
 * offline concierge reply, no AI-alone column). `CONCIERGE_MODE=replay` and
 * `COMPARE_MODE=replay` answer from recorded synthetic fixtures instead of the API.
 */
export async function getLlm(purpose: LlmPurpose): Promise<LlmProvider | null> {
  if (!providers.has(purpose)) {
    const env = readServerEnv();
    const openai = await import("./openai");
    let provider: LlmProvider | null = null;
    if (purpose === "concierge" && env.CONCIERGE_MODE === "replay") {
      const { createReplayClient } = await import("./replay");
      provider = openai.createOpenAIProvider(createReplayClient(), env.OPENAI_MODEL);
    } else if (purpose === "compare" && env.COMPARE_MODE === "replay") {
      const { createCompareReplayClient } = await import("./compare-replay");
      provider = openai.createOpenAIProvider(createCompareReplayClient(), env.OPENAI_MODEL);
    } else {
      const client = openai.getOpenAIClient();
      provider = client ? openai.createOpenAIProvider(client, env.OPENAI_MODEL) : null;
    }
    providers.set(purpose, provider);
  }
  return providers.get(purpose) ?? null;
}
