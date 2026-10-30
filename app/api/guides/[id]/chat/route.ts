import { connection, type NextRequest } from "next/server";
import { z } from "zod";

import { CHAT_LIMITS, type ChatEvent } from "@/lib/ai/chat";
import { loadChatHistory, loadConciergeData, saveChatTurn } from "@/lib/ai/chat-store";
import { chatRequestSchema, createChatRateLimiter, runConciergeTurn } from "@/lib/ai/concierge";
import { getLlm } from "@/lib/ai/provider";
import { createServiceClient } from "@/lib/db/server";
import { createSupabaseGuideStore } from "@/lib/guide/store";
import { isGuideToken, sameToken } from "@/lib/guide/token";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const perGuide = createChatRateLimiter();
const perIp = createRateLimiter({ limit: 60, windowMs: 60 * 60_000 });

const encoder = new TextEncoder();
const sse = (event: ChatEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/**
 * The concierge (G6): one guest message in, server-sent events out (`ChatEvent`: text
 * deltas, validated cards, status, done). The guest's token goes in the JSON body with the
 * message (`{ token, message }`, at most 500 characters). 20 messages per guide per hour.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/guides/[id]/chat">,
) {
  await connection();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const ip = perIp.check(clientIp(request.headers));
  if (!ip.allowed) return tooManyRequests(ip.retryAfterS);

  const body = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: "Please send a message of 1 to 500 characters." },
      { status: 400 },
    );
  }
  if (!isGuideToken(body.data.token)) return notFound();

  const db = createServiceClient();
  const { data: guide } = await db
    .from("guides")
    .select("id, token, status")
    .eq("id", id)
    .maybeSingle();
  if (!guide || !sameToken(body.data.token, guide.token)) return notFound();
  if (guide.status !== "ready") {
    return Response.json({ error: "Your guide isn't ready yet." }, { status: 409 });
  }

  const limit = perGuide.check(guide.id);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterS);
  // The in-memory limit is per server instance; the stored messages make it hold across them.
  const { count: recent } = await db
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("guide_id", guide.id)
    .eq("role", "user")
    .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
  if ((recent ?? 0) >= CHAT_LIMITS.perHour) return tooManyRequests(60 * 60);

  const [data, history] = await Promise.all([
    loadConciergeData(db, guide.id),
    loadChatHistory(db, guide.id),
  ]);
  if (!data) return notFound();
  const llm = await getLlm("concierge");
  const store = createSupabaseGuideStore(db);

  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        if (open) controller.enqueue(sse(event));
      };
      try {
        const result = await runConciergeTurn({
          llm,
          data,
          history,
          message: body.data.message,
          emit: send,
          log: (entry) => store.logLlm(entry),
          signal: request.signal,
        });
        // A guest who left mid-reply gets no stored half-answer.
        if (request.signal.aborted) return;
        // Stored before "done", so a reload right after shows the whole exchange.
        await saveChatTurn(db, guide.id, body.data.message, {
          text: result.text,
          cards: result.cards,
          seen: result.seen,
        }).catch((error) => console.error("chat save failed", guide.id, error));
        send({ type: "done" });
      } catch (error) {
        console.error("concierge turn failed", guide.id, error);
        send({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
