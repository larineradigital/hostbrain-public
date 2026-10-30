import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type {
  FunctionTool,
  Response,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { z } from "zod";

import { readServerEnv } from "@/lib/env";

import {
  LlmError,
  type AgentRequest,
  type AgentResult,
  type AgentTool,
  type LlmCall,
  type LlmProvider,
  type StructuredRequest,
  type StructuredResult,
} from "./provider";

/**
 * The OpenAI implementation of the provider: the Responses API with strict
 * structured outputs (zod) and strict function tools.
 *
 * - `store: false` on every call: guest messages are not kept as stored responses. The tool
 *   loop sends the previous output items back itself, reasoning included (encrypted).
 * - Prompt caching is automatic for a stable prefix: the tools and the instructions come
 *   first and never change, and `prompt_cache_key` routes requests with the same prefix
 *   together. Cached tokens are logged as `usage.cached_input_tokens`.
 */

let client: OpenAI | null | undefined;

/** Process-wide OpenAI client, or null when `OPENAI_API_KEY` is not set (mock runs). */
export function getOpenAIClient(): OpenAI | null {
  if (client === undefined) {
    const env = readServerEnv();
    client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
  }
  return client;
}

const cacheKey = (job: string) => `host-brain-${job}`;

function stopReasonOf(response: Response): string {
  if (response.status === "incomplete") {
    return response.incomplete_details?.reason ?? "incomplete";
  }
  if (response.status && response.status !== "completed") return response.status;
  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
  return refused ? "refusal" : "completed";
}

function callOf(response: Response): LlmCall {
  const usage = response.usage;
  return {
    servedBy: response.model,
    stopReason: stopReasonOf(response),
    usage: {
      input_tokens: usage?.input_tokens ?? 0,
      cached_input_tokens: usage?.input_tokens_details?.cached_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      reasoning_tokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
    },
  };
}

/** Visible text of a response; refusals are not text. */
function textOf(response: Response): string {
  return response.output
    .flatMap((item) =>
      item.type === "message"
        ? item.content.flatMap((part) => (part.type === "output_text" ? [part.text] : []))
        : [],
    )
    .join("")
    .trim();
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof OpenAI.APIError) {
    return new LlmError(`${error.name}: ${error.message}`, error.status ?? null);
  }
  if (error instanceof Error) return new LlmError(`${error.name}: ${error.message}`, null);
  return new LlmError("unknown error", null);
}

const toolError = (message: string) => JSON.stringify({ error: message });

/** Runs one function call: parse, validate with zod, run. Every failure goes back as text. */
async function runTool(
  tools: ReadonlyMap<string, AgentTool>,
  call: ResponseFunctionToolCall,
): Promise<string> {
  const tool = tools.get(call.name);
  if (!tool) return toolError(`Unknown tool ${call.name}.`);
  let args: unknown;
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return toolError("The arguments were not valid JSON.");
  }
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) return toolError(`Invalid input. ${z.prettifyError(parsed.error)}`);
  try {
    return await tool.run(parsed.data);
  } catch (error) {
    return toolError(error instanceof Error ? error.message : "The tool failed.");
  }
}

export function createOpenAIProvider(openai: OpenAI, model: string): LlmProvider {
  async function generateStructured<T>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResult<T>> {
    try {
      const response = await openai.responses.parse(
        {
          model,
          instructions: request.instructions,
          input: request.input,
          text: { format: zodTextFormat(request.schema, request.name) },
          reasoning: { effort: request.effort },
          max_output_tokens: request.maxOutputTokens,
          store: false,
          prompt_cache_key: cacheKey(request.name),
        },
        { timeout: request.timeoutMs, maxRetries: request.maxRetries },
      );
      const call = callOf(response);
      // Check why it stopped before reading the output: a refusal or a cut-off answer.
      const output =
        call.stopReason === "completed" ? ((response.output_parsed as T | null) ?? null) : null;
      return { output, call };
    } catch (error) {
      throw toLlmError(error);
    }
  }

  async function runAgent(request: AgentRequest): Promise<AgentResult> {
    const tools: FunctionTool[] = request.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true,
    }));
    const byName = new Map(request.tools.map((tool) => [tool.name, tool]));
    const input: ResponseInputItem[] = [
      { role: "developer", content: request.context },
      ...request.messages.map((message) => ({ role: message.role, content: message.text })),
    ];

    let iterations = 0;
    let stopReason: string | null = null;
    try {
      while (iterations < request.maxIterations) {
        if (request.signal?.aborted) throw new LlmError("AbortError: the turn was stopped", null);
        const iteration = ++iterations;
        const started = Date.now();
        const stream = await openai.responses.create(
          {
            model,
            instructions: request.instructions,
            tools,
            tool_choice: "auto",
            input,
            reasoning: { effort: request.effort },
            max_output_tokens: request.maxOutputTokens,
            store: false,
            include: ["reasoning.encrypted_content"],
            prompt_cache_key: cacheKey("concierge"),
            stream: true,
          },
          { signal: request.signal, maxRetries: 1 },
        );
        let response: Response | null = null;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") request.onText(event.delta, iteration);
          else if (event.type === "response.completed" || event.type === "response.incomplete") {
            response = event.response;
          } else if (event.type === "response.failed") {
            throw new LlmError(
              `ResponseFailed: ${event.response.error?.message ?? "failed"}`,
              null,
            );
          } else if (event.type === "error") {
            throw new LlmError(`StreamError: ${event.message}`, null);
          }
        }
        if (!response) throw new LlmError("StreamError: ended without a response", null);

        const call = callOf(response);
        stopReason = call.stopReason;
        const calls = response.output.filter(
          (item): item is ResponseFunctionToolCall => item.type === "function_call",
        );
        await request.onStep({
          iteration,
          call,
          text: textOf(response),
          tools: calls.map((c) => c.name),
          latencyMs: Date.now() - started,
        });
        if (call.stopReason !== "completed") break;
        if (!calls.length) {
          const nudge = iteration < request.maxIterations ? (request.onFinish?.() ?? null) : null;
          if (!nudge) break;
          input.push(...toResponseInputItems(response.output), {
            role: "developer",
            content: nudge,
          });
          continue;
        }

        // The model's items (reasoning, text, calls) go back with the results, in order.
        // One step's calls are independent (the model can't use a result it hasn't seen),
        // so they run together; the Qloo client still throttles its own requests.
        input.push(...toResponseInputItems(response.output));
        const outputs = await Promise.all(calls.map((fn) => runTool(byName, fn)));
        calls.forEach((fn, i) => {
          input.push({ type: "function_call_output", call_id: fn.call_id, output: outputs[i] });
        });
      }
    } catch (error) {
      throw toLlmError(error);
    }
    return { iterations, stopReason };
  }

  return { name: "openai", model, generateStructured, runAgent };
}
