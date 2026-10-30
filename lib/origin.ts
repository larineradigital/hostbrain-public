import "server-only";

import { readServerEnv } from "@/lib/env";

const isLocalUrl = (url: string) => {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

/** The origin this request came in on, from proxy headers (localhost on any port). */
export function requestOrigin(headers: Headers): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The public origin for links that leave the browser: QR codes, printed cards, copied guest
 * links, the magic-link redirect. APP_URL (https://hostbrain.larinera.com in production) wins,
 * so a QR printed from any host or proxy address always points at the real domain. Without
 * APP_URL, or when it is a localhost address (the dev default), the request's own origin is
 * used, so `pnpm dev` on any port and e2e servers get working links.
 */
export function publicOrigin(
  headers: Headers,
  appUrl: string | undefined = readServerEnv().APP_URL,
): string {
  if (appUrl && !isLocalUrl(appUrl)) return new URL(appUrl).origin;
  return requestOrigin(headers);
}
