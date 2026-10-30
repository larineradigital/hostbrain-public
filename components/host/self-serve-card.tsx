"use client";

import { Download, Printer, QrCode } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { setSelfServe } from "@/app/host/actions";
import { Button } from "@/components/ui/button";

import { CopyButton } from "./copy-button";
import { QrImage } from "./qr-dialog";

/**
 * For hotels: one self-serve QR per property. Guests scan it, answer the
 * quiz and get their own guide; each scan is a new guide in the Guests tab.
 */
export function SelfServeCard({
  propertyId,
  enabled,
  url,
}: {
  propertyId: string;
  enabled: boolean;
  /** Null until self-serve has been turned on once. */
  url: string | null;
}) {
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const result = await setSelfServe(propertyId, !enabled);
      if (!result.ok) toast.error(result.error);
      else toast.success(enabled ? "Self-serve is off" : "Self-serve is on");
    });

  return (
    <section
      aria-labelledby="self-serve-title"
      className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="self-serve-title" className="flex items-center gap-3 text-heading">
            <span
              className="flex size-9 items-center justify-center rounded-xl bg-brand-soft"
              aria-hidden
            >
              <QrCode className="size-[18px] text-brand" />
            </span>
            Self-serve QR
          </h2>
          <p className="max-w-prose text-sm text-ink-muted">
            Put one QR code in every room or at the front desk. Each guest who scans it gets their
            own guide. Up to 30 new guides an hour.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Self-serve guides"
          disabled={pending}
          onClick={toggle}
          className="group inline-flex min-h-11 items-center gap-3 rounded-full px-1 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <span aria-hidden>{enabled ? "On" : "Off"}</span>
          <span
            aria-hidden
            className="relative h-7 w-12 rounded-full bg-line-strong transition-colors group-aria-checked:bg-brand"
          >
            <span className="absolute top-1 left-1 size-5 rounded-full bg-surface shadow-card transition-transform group-aria-checked:translate-x-5" />
          </span>
        </button>
      </div>

      {enabled && url && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <QrImage src={`/host/properties/${propertyId}/qr`} alt="Self-serve QR code" />
          <div className="flex min-w-0 flex-col gap-3">
            <p
              className="rounded-xl bg-tint px-3.5 py-2.5 font-mono text-sm break-all"
              data-testid="self-serve-url"
            >
              {url}
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={url} label="Copy self-serve link" />
              <Button asChild size="sm" variant="outline">
                <a href={`/host/properties/${propertyId}/qr?download`} download>
                  <Download aria-hidden />
                  Download QR
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/host/properties/${propertyId}/print`}>
                  <Printer aria-hidden />
                  Print card
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
