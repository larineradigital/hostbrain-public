/**
 * Retention rules for the daily cleanup. Pure, so the dates are
 * unit-tested; scripts/cleanup.ts runs the queries.
 */

/** Guest first names and chat messages are kept this many days after check-out. */
export const RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60_000;

/**
 * Expired `qloo_cache` rows are kept this many days past `expires_at` before they are
 * deleted. Replay mode serves expired rows on purpose (lib/qloo/client.ts), and the TTLs are
 * only 24–72 h, so deleting on expiry would empty the judging fallback within days. Qloo
 * allows private server-side caching with no time limit.
 */
export const CACHE_GRACE_DAYS = 30;

/** Cache rows that expired before this instant are deleted. */
export const cacheDeleteBefore = (now: Date, graceDays = CACHE_GRACE_DAYS) =>
  new Date(now.getTime() - graceDays * DAY_MS).toISOString();

/**
 * The cut-offs for `now`. A guide is past retention when its check-out date (a calendar date,
 * read in UTC) is on or before `checkOutOnOrBefore`: a stay that ended Oct 1 is cleaned on
 * Oct 31. A guide without a check-out date counts from when it was created
 * (`createdBefore`), so open-ended self-serve guides are cleaned too.
 */
export function retentionCutoffs(now: Date, days = RETENTION_DAYS) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    checkOutOnOrBefore: new Date(today - days * DAY_MS).toISOString().slice(0, 10),
    createdBefore: new Date(now.getTime() - days * DAY_MS).toISOString(),
  };
}

/** Whether one guide is past retention on `now` (the same rule as the query). */
export function isPastRetention(
  guide: { check_out: string | null; created_at: string },
  now: Date,
  days = RETENTION_DAYS,
) {
  const cut = retentionCutoffs(now, days);
  return guide.check_out
    ? guide.check_out <= cut.checkOutOnOrBefore
    : new Date(guide.created_at).getTime() < new Date(cut.createdBefore).getTime();
}
