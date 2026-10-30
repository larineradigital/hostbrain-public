import "server-only";

/**
 * In-memory sliding-window limiter, per server instance. Good enough for the single
 * Railway instance (railway.toml); a DB counter can back it later if we ever run more.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit and says whether it is allowed. */
    check(key: string, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      const allowed = recent.length < limit;
      if (allowed) recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      const retryAfterS = allowed ? 0 : Math.ceil((recent[0] + windowMs - now) / 1000);
      return { allowed, retryAfterS };
    },
  };
}

/** Best-effort client IP from proxy headers (Railway's edge proxy sets x-forwarded-for). */
export function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local"
  );
}

export function tooManyRequests(retryAfterS: number) {
  return Response.json(
    { error: "Too many requests. Please slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfterS) } },
  );
}
