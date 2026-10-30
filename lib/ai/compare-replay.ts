import "server-only";

import OpenAI from "openai";

import fixture from "@/tests/fixtures/openai/compare.json";

/**
 * Replay mode for the AI-alone comparison (`COMPARE_MODE=replay`, used by e2e): an OpenAI
 * client whose `fetch` answers `responses.parse` from a synthetic fixture. The real
 * structured-output parsing, the Qloo check (mock Qloo) and the summary all run unchanged.
 * The answer is picked by a phrase in the guest description.
 */

interface Answer {
  name: string;
  match?: string;
  output_parsed: { restaurants: Array<{ name: string }> };
}

const answers = fixture.answers as Answer[];
const fallback = fixture.fallback as Answer;

interface RequestBody {
  model?: string;
  input?: string | Array<{ role?: string; content?: string | Array<{ text?: string }> }>;
}

/** The fixture answer for a request. Exported for tests. */
export function pickAnswer(body: RequestBody): Answer {
  const input = body.input ?? "";
  const text = (
    typeof input === "string"
      ? input
      : input
          .filter((item) => item.role === "user")
          .map((item) =>
            typeof item.content === "string"
              ? item.content
              : (item.content ?? []).map((part) => part.text ?? "").join(" "),
          )
          .join(" ")
  ).toLowerCase();
  return answers.find((a) => a.match && text.includes(a.match.toLowerCase())) ?? fallback;
}

let counter = 0;

export function createCompareReplayClient(): OpenAI {
  const replayFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as RequestBody;
    const answer = pickAnswer(body);
    const id = `fix_compare_${++counter}`;
    return Response.json(
      {
        id: `resp_${id}`,
        object: "response",
        created_at: 1_793_000_000,
        model: body.model ?? "replay-model",
        status: "completed",
        incomplete_details: null,
        error: null,
        output: [
          {
            type: "message",
            id: `msg_${id}`,
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(answer.output_parsed),
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 0,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 0,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 0,
        },
      },
      { headers: { "x-request-id": `req_${id}` } },
    );
  };
  return new OpenAI({ apiKey: "replay", fetch: replayFetch, maxRetries: 0 });
}
