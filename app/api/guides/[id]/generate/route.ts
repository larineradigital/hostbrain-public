import { connection, type NextRequest } from "next/server";
import { z } from "zod";

import { getHost } from "@/lib/auth";
import { createServiceClient } from "@/lib/db/server";
import {
  defaultPipelineDeps,
  GuideBusyError,
  GuideNotFoundError,
  prepareGeneration,
  runGeneration,
} from "@/lib/guide/pipeline";
import { isGuideToken, sameToken } from "@/lib/guide/token";
import type { GenerationEvent } from "@/lib/guide/types";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const perGuide = createRateLimiter({ limit: 6, windowMs: 60 * 60_000 });
const perIp = createRateLimiter({ limit: 30, windowMs: 60 * 60_000 });

const bodySchema = z
  .object({ token: z.string().optional(), force: z.boolean().optional() })
  .catch({});

const encoder = new TextEncoder();
const sse = (event: GenerationEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Generates a guide and streams progress as server-sent events (one JSON object per
 * `data:` line, see `GenerationEvent`). Read it with `fetch` + a stream reader, since
 * EventSource can't POST.
 *
 * Who may call it: the guest, with the guide's token in the JSON body (`{ token }`), or
 * the host who owns the property (session cookie). Only the host may `force` a rerun of
 * a ready guide; for anyone else a ready guide answers with a single `done` event.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/guides/[id]/generate">,
) {
  await connection();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Not found" }, { status: 404 });

  const ip = perIp.check(clientIp(request.headers));
  if (!ip.allowed) return tooManyRequests(ip.retryAfterS);

  const body = bodySchema.parse(await request.json().catch(() => ({})));
  const db = createServiceClient();
  const { data: guide } = await db
    .from("guides")
    .select("id, token, status, properties (host_id)")
    .eq("id", id)
    .maybeSingle();
  if (!guide) return Response.json({ error: "Not found" }, { status: 404 });

  let isHost = false;
  if (isGuideToken(body.token)) {
    if (!sameToken(body.token, guide.token))
      return Response.json({ error: "Not found" }, { status: 404 });
  } else {
    const host = await getHost();
    if (!host || guide.properties?.host_id !== host.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    isHost = true;
  }

  if (guide.status === "ready" && !(isHost && body.force)) {
    return new Response(sse({ type: "done", guideId: guide.id, token: guide.token }), {
      headers: SSE_HEADERS,
    });
  }

  const limit = perGuide.check(guide.id);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterS);

  const deps = defaultPipelineDeps();
  let context;
  try {
    context = await prepareGeneration(guide.id, deps);
  } catch (error) {
    if (error instanceof GuideBusyError) {
      return Response.json({ error: "Your guide is already being built." }, { status: 409 });
    }
    if (error instanceof GuideNotFoundError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }

  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: GenerationEvent) => {
        if (open) controller.enqueue(sse(event));
      };
      // Generation keeps going if the guest closes the page; the guide is ready when they return.
      runGeneration(context, send, deps)
        .catch((error) => console.error("guide generation failed", guide.id, error))
        .finally(() => {
          if (open) {
            open = false;
            controller.close();
          }
        });
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
