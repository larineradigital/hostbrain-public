import type { GenerationEvent } from "./types";

/**
 * Splits a server-sent-events buffer into complete `data:` events and the unfinished
 * rest, for reading `POST /api/guides/[id]/generate` and `/chat` with `fetch` (EventSource
 * can't POST).
 */
export function parseSse<T = GenerationEvent>(buffer: string): { events: T[]; rest: string } {
  const chunks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = chunks.pop() ?? "";
  const events: T[] = [];
  for (const chunk of chunks) {
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as T);
    } catch {
      // A malformed event is skipped; the next one still counts.
    }
  }
  return { events, rest };
}
