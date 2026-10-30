import "server-only";

import QRCode from "qrcode";

/**
 * QR codes for guide links and hotel self-serve cards, as SVG (crisp in print, small).
 * Black on white with a quiet zone, so any phone camera reads them.
 */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
}

export const guideUrl = (origin: string, token: string) => `${origin}/g/${token}`;
export const selfServeUrl = (origin: string, token: string) => `${origin}/s/${token}`;

/** An SVG response, inline or as a download. */
export function svgResponse(svg: string, filename: string, download: boolean) {
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, no-store",
      ...(download ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}
