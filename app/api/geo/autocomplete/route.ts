import type { NextRequest } from "next/server";

import { getHost } from "@/lib/auth";
import { autocompleteAddress } from "@/lib/geo/photon";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/** Address type-ahead for the host's property form (Photon fair use: hosts only). */
export async function GET(request: NextRequest) {
  const { allowed, retryAfterS } = limiter.check(clientIp(request.headers));
  if (!allowed) return tooManyRequests(retryAfterS);
  if (!(await getHost())) return Response.json({ error: "Sign in first" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json({ items: [] });
  if (q.length > 120) return Response.json({ error: "Query too long" }, { status: 400 });

  try {
    const items = await autocompleteAddress(q);
    return Response.json({ items });
  } catch {
    return Response.json(
      { items: [], error: "Address search is unavailable right now." },
      { status: 502 },
    );
  }
}
