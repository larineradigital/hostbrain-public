import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

/** A nanoid-compatible 21-character URL-safe token (126 bits) for `/g/[token]`. */
export function newGuideToken(size = 21): string {
  const bytes = randomBytes(size);
  let token = "";
  for (let i = 0; i < size; i++) token += ALPHABET[bytes[i] & 63];
  return token;
}

export const isGuideToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{21}$/.test(value);

/** Constant-time comparison so a token can't be guessed character by character. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
