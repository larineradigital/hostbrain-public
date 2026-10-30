import "server-only";

export interface ThrottleOptions {
  /** Request starts per second (token refill rate). */
  ratePerSecond: number;
  /** Bucket size. 1 means evenly spaced starts with no bursts. */
  burst: number;
  /** Requests allowed in flight at once. */
  maxInFlight: number;
  now?: () => number;
}

/**
 * Token bucket plus an in-flight cap, shared by every Qloo call in the process.
 * Waiters are served first in, first out. `pauseFor` blocks new starts until the
 * server's per-second window resets (from `x-second-ratelimit-*` headers or a 429).
 */
export class Throttle {
  private readonly rate: number;
  private readonly burst: number;
  private readonly maxInFlight: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefill: number;
  private pausedUntil = 0;
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: ThrottleOptions) {
    this.rate = options.ratePerSecond;
    this.burst = options.burst;
    this.maxInFlight = options.maxInFlight;
    this.now = options.now ?? Date.now;
    this.tokens = options.burst;
    this.lastRefill = this.now();
  }

  /** Waits for a slot. Call the returned function once the request (and its body) is done. */
  async acquire(): Promise<() => void> {
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.pump();
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight--;
      this.pump();
    };
  }

  /** Blocks new starts for `ms` milliseconds from now. */
  pauseFor(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + ms);
  }

  get active() {
    return this.inFlight;
  }

  private pump() {
    if (this.timer) return;
    while (this.queue.length > 0 && this.inFlight < this.maxInFlight) {
      const now = this.now();
      if (now < this.pausedUntil) return this.schedule(this.pausedUntil - now);
      this.tokens = Math.min(
        this.burst,
        this.tokens + ((now - this.lastRefill) * this.rate) / 1000,
      );
      this.lastRefill = now;
      if (this.tokens < 1) return this.schedule(Math.ceil(((1 - this.tokens) * 1000) / this.rate));
      this.tokens -= 1;
      this.inFlight++;
      this.queue.shift()!();
    }
  }

  private schedule(ms: number) {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pump();
    }, ms);
  }
}
