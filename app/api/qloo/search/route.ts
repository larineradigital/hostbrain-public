import type { NextRequest } from "next/server";
import { z } from "zod";

import { getHost } from "@/lib/auth";
import { createServiceClient } from "@/lib/db/server";
import { isGuideToken } from "@/lib/guide/token";
import { searchArtists, searchMedia, searchPlaces } from "@/lib/qloo/endpoints";
import { QlooError } from "@/lib/qloo/errors";
import { QlooGuardError } from "@/lib/qloo/guard";
import { toSearchItem } from "@/lib/qloo/view";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const perGuide = createRateLimiter({ limit: 150, windowMs: 60 * 60_000 });

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  kind: z.enum(["place", "artist", "media"]),
  propertyId: z.uuid().optional(),
  token: z.string().optional(),
});

/**
 * Type-ahead search through the Qloo client (Q1, Q2, Q4).
 * - `place` is for host picks: needs a signed-in host and one of their properties (RLS).
 * - `artist` and `media` feed the guest quiz chips: need the guest's guide token, so this
 *   isn't an open proxy to the Qloo quota.
 */
export async function GET(request: NextRequest) {
  const { allowed, retryAfterS } = limiter.check(clientIp(request.headers));
  if (!allowed) return tooManyRequests(retryAfterS);

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return Response.json({ items: [] });
  const { q, kind, propertyId, token } = parsed.data;

  try {
    if (kind === "place") {
      if (!propertyId) return Response.json({ error: "propertyId is required" }, { status: 400 });
      const host = await getHost();
      if (!host) return Response.json({ error: "Sign in first" }, { status: 401 });
      const supabase = await createSupabaseServerClient();
      const { data: property } = await supabase
        .from("properties")
        .select("lat, lng")
        .eq("id", propertyId)
        .maybeSingle();
      if (!property) return Response.json({ error: "Property not found" }, { status: 404 });
      const near = { lat: property.lat, lng: property.lng };
      const result = await searchPlaces({ query: q, near, radiusM: 3000, take: 8 });
      return Response.json({ items: result.items.map((e) => toSearchItem(e, near)) });
    }

    if (!isGuideToken(token)) return Response.json({ error: "Not found" }, { status: 404 });
    const { data: guide } = await createServiceClient()
      .from("guides")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    if (!guide) return Response.json({ error: "Not found" }, { status: 404 });
    const perToken = perGuide.check(guide.id);
    if (!perToken.allowed) return tooManyRequests(perToken.retryAfterS);

    const result =
      kind === "artist" ? await searchArtists(q, { take: 8 }) : await searchMedia(q, { take: 8 });
    return Response.json({ items: result.items.map((e) => toSearchItem(e)) });
  } catch (error) {
    if (error instanceof QlooGuardError) return Response.json({ items: [] });
    if (error instanceof QlooError) {
      return Response.json(
        { items: [], error: "Search is unavailable right now." },
        { status: 502 },
      );
    }
    throw error;
  }
}
