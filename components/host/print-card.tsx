import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { PrintButton } from "./print-button";

/**
 * H5: the A6 print card (105 × 148 mm). The browser's print dialog makes the PDF; the
 * screen shows a preview with a Print button. `qrSvg` is generated server-side by `qrcode`.
 */
export function PrintCard({
  qrSvg,
  city,
  propertyName,
  forName,
  backHref,
  backLabel,
}: {
  qrSvg: string;
  city: string;
  propertyName: string;
  forName?: string | null;
  backHref: string;
  backLabel: string;
}) {
  return (
    <main className="flex flex-col items-center gap-6 print:block">
      {/* Only this page prints on A6, edge to edge. */}
      <style>{`@page { size: A6 portrait; margin: 0; }`}</style>
      <div className="flex w-full max-w-[105mm] items-center justify-between gap-4 print:hidden">
        <Link
          href={backHref}
          className="-ml-3 flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold hover:bg-tint"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
        <PrintButton />
      </div>
      <article
        aria-label="Print card"
        className="flex h-[148mm] w-[105mm] flex-col items-center justify-between overflow-hidden rounded-2xl border bg-white px-[10mm] py-[12mm] text-center text-black shadow-float print:rounded-none print:border-0 print:shadow-none"
      >
        <p className="text-sm font-semibold tracking-wide uppercase">{propertyName}</p>
        <div className="flex flex-col items-center gap-[6mm]">
          <div
            className="size-[58mm] [&>svg]:size-full"
            role="img"
            aria-label="QR code"
            // SVG markup from the `qrcode` package for a URL we built; no user HTML.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex flex-col gap-[2mm]">
            <h1 className="text-[20pt] leading-tight font-bold tracking-tight">
              Your personal guide to {city}
            </h1>
            <p className="text-[11pt]">Scan to get places picked for your taste</p>
            {forName && <p className="text-[10pt]">Made for {forName}</p>}
          </div>
        </div>
        <p className="text-[8pt]">Picked with Qloo taste data · Host Brain</p>
      </article>
    </main>
  );
}
