import "server-only";

export type QlooErrorKind = "config" | "http" | "network" | "replay_miss" | "schema";

/** A Qloo call that failed. Messages never contain the API key. */
export class QlooError extends Error {
  /** HTTP attempts made before giving up (for `api_log`). */
  attempts = 0;
  monthRemaining: number | undefined;

  constructor(
    readonly kind: QlooErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QlooError";
  }
}
