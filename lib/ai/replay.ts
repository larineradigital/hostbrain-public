import "server-only";

import OpenAI from "openai";

import fixture from "@/tests/fixtures/openai/concierge.json";

/**
 * Replay mode for the concierge (`CONCIERGE_MODE=replay`, used by e2e): an OpenAI client
 * whose `fetch` answers from a recorded, synthetic fixture instead of the API, streamed as
 * Responses API server-sent events. The real tool loop, our tools, mock Qloo and the ID
 * validation all run unchanged; only the model's turns are canned. The reply is picked by
 * a phrase in the guest's latest message, and the step by how many tool rounds followed it.
 */

export type FixtureItem =
  | { type: "function_call"; name: string; arguments: string }
  | {
      type: "message";
      role: "assistant";
      content: Array<{ type: "output_text"; text: string } | { type: "refusal"; refusal: string }>;
    };

export interface FixtureTurn {
  status: "completed" | "incomplete";
  output: FixtureItem[];
}

interface Conversation {
  name: string;
  match: string;
  turns: FixtureTurn[];
}

const conversations = fixture.conversations as Conversation[];
const fallback = fixture.fallback as Conversation;

type InputItem = {
  type?: string;
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
};

interface RequestBody {
  model?: string;
  input?: string | InputItem[];
}

/** The conversation and step a request is at. Exported for tests. */
export function pickTurn(body: RequestBody): { conversation: Conversation; turn: FixtureTurn } {
  const input: InputItem[] =
    typeof body.input === "string" ? [{ role: "user", content: body.input }] : (body.input ?? []);
  let lastUser = -1;
  let text = "";
  input.forEach((item, i) => {
    if (item.role !== "user") return;
    const words =
      typeof item.content === "string"
        ? item.content
        : (item.content ?? [])
            .filter((part) => part.type === "input_text")
            .map((part) => part.text ?? "")
            .join(" ");
    if (words.trim()) {
      lastUser = i;
      text = words.toLowerCase();
    }
  });
  // One tool round = the model's calls followed by a run of function_call_output items.
  const after = input.slice(lastUser + 1);
  const step = after.filter(
    (item, i) =>
      item.type === "function_call_output" && after[i + 1]?.type !== "function_call_output",
  ).length;
  const conversation = conversations.find((c) => text.includes(c.match.toLowerCase())) ?? fallback;
  const turn = conversation.turns[Math.min(step, conversation.turns.length - 1)];
  return { conversation, turn };
}

/** The fixture items with the ids and fields the API adds. */
function outputItems(turn: FixtureTurn, id: string) {
  return turn.output.map((item, index) =>
    item.type === "function_call"
      ? {
          ...item,
          id: `fc_fix_${id}_${index}`,
          call_id: `call_fix_${id}_${index}`,
          status: "completed",
        }
      : {
          ...item,
          id: `msg_fix_${id}_${index}`,
          status: "completed",
          content: item.content.map((part) =>
            part.type === "output_text" ? { ...part, annotations: [] } : part,
          ),
        },
  );
}

/** One recorded turn as a full Responses API response object. */
export function responseFor(turn: FixtureTurn, model: string, id: string, outputTokens = 0) {
  return {
    id: `resp_fix_${id}`,
    object: "response",
    created_at: 1_793_000_000,
    model,
    status: turn.status,
    incomplete_details: turn.status === "incomplete" ? { reason: "max_output_tokens" } : null,
    error: null,
    output: outputItems(turn, id),
    usage: {
      input_tokens: 0,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: outputTokens,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: outputTokens,
    },
  };
}

const encoder = new TextEncoder();

/** Server-sent events in the Responses API streaming format for one recorded turn. */
export function streamTurn(turn: FixtureTurn, model: string, id: string, delayMs: number) {
  const chunks: Uint8Array[] = [];
  let sequence = 0;
  const event = (type: string, data: object) =>
    chunks.push(
      encoder.encode(
        `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`,
      ),
    );

  const pieces = (text: string) => text.match(/\S+\s*/g) ?? [];
  const outputTokens = turn.output.reduce(
    (n, item) =>
      n +
      (item.type === "function_call"
        ? 10
        : item.content.reduce(
            (m, part) => m + pieces(part.type === "output_text" ? part.text : part.refusal).length,
            0,
          )),
    0,
  );
  const done = responseFor(turn, model, id, outputTokens);
  event("response.created", { response: { ...done, status: "in_progress", output: [] } });
  done.output.forEach((item, output_index) => {
    if (item.type === "function_call") {
      event("response.output_item.added", {
        output_index,
        item: { ...item, arguments: "", status: "in_progress" },
      });
      event("response.function_call_arguments.delta", {
        output_index,
        item_id: item.id,
        delta: item.arguments,
      });
      event("response.function_call_arguments.done", {
        output_index,
        item_id: item.id,
        arguments: item.arguments,
      });
    } else {
      event("response.output_item.added", {
        output_index,
        item: { ...item, content: [], status: "in_progress" },
      });
      item.content.forEach((part, content_index) => {
        const where = { output_index, item_id: item.id, content_index };
        const empty =
          part.type === "output_text" ? { ...part, text: "" } : { ...part, refusal: "" };
        event("response.content_part.added", { ...where, part: empty });
        if (part.type === "output_text") {
          for (const delta of pieces(part.text)) {
            event("response.output_text.delta", { ...where, delta, logprobs: [] });
          }
          event("response.output_text.done", { ...where, text: part.text, logprobs: [] });
        } else {
          for (const delta of pieces(part.refusal)) {
            event("response.refusal.delta", { ...where, delta });
          }
          event("response.refusal.done", { ...where, refusal: part.refusal });
        }
        event("response.content_part.done", { ...where, part });
      });
    }
    event("response.output_item.done", { output_index, item });
  });
  event(turn.status === "completed" ? "response.completed" : "response.incomplete", {
    response: done,
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      controller.close();
    },
  });
}

let counter = 0;

export function createReplayClient({ delayMs = 12 } = {}): OpenAI {
  const replayFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as RequestBody;
    const { turn } = pickTurn(body);
    const id = `${++counter}`;
    return new Response(streamTurn(turn, body.model ?? "replay-model", id, delayMs), {
      status: 200,
      headers: { "content-type": "text/event-stream", "x-request-id": `req_fix_${counter}` },
    });
  };
  return new OpenAI({ apiKey: "replay", fetch: replayFetch, maxRetries: 0 });
}
