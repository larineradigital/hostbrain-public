import type { NextRequest } from "next/server";
import { connection } from "next/server";

import { createServiceClient } from "@/lib/db/server";
import { isGuideToken } from "@/lib/guide/token";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { getWeather } from "@/lib/weather";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/**
 * `GET /api/weather?token=…`: the weather at the guide's property. Takes the guest
 * token, not coordinates, so this isn't an open proxy to Open-Meteo.
 */
export async function GET(request: NextRequest) {
  await connection();
  const { allowed, retryAfterS } = limiter.check(clientIp(request.headers));
  if (!allowed) return tooManyRequests(retryAfterS);

  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!isGuideToken(token)) return Response.json({ error: "Not found" }, { status: 404 });
  const { data: guide } = await createServiceClient()
    .from("guides")
    .select("properties (lat, lng)")
    .eq("token", token)
    .maybeSingle();
  if (!guide?.properties) return Response.json({ error: "Not found" }, { status: 404 });

  const report = await getWeather(guide.properties);
  if (!report) return Response.json({ error: "Weather is unavailable" }, { status: 502 });
  return Response.json(report, { headers: { "Cache-Control": "private, max-age=600" } });
}
