import { ExternalLink, Printer, Users } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatStayDates } from "@/lib/guide/format";
import type { Database } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";
import { QrDialog } from "./qr-dialog";

type GuideStatus = Database["public"]["Enums"]["guide_status"];

export interface GuestRow {
  id: string;
  token: string;
  firstName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: GuideStatus;
  viewedAt: string | null;
  questions: number;
  source: string;
  createdAt: string;
}

const STATUS: Record<GuideStatus, { label: string; className: string }> = {
  awaiting_quiz: { label: "Waiting for quiz", className: "bg-tint text-ink" },
  generating: { label: "Building", className: "bg-sea/15 text-sea" },
  ready: { label: "Ready", className: "bg-olive/15 text-olive" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

const SOURCE: Record<string, string> = { self_serve: "Self-serve", demo: "Demo" };

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(iso),
  );

/** H4 Guests tab: one row per guide, newest first. Cards on phones, a table from `md`. */
export function GuestsTable({ rows, origin }: { rows: GuestRow[]; origin: string }) {
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
        <span
          className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft"
          aria-hidden
        >
          <Users className="size-7 text-brand" />
        </span>
        <p className="text-heading font-semibold">No guest guides yet</p>
        <p className="text-ink-muted">
          Create one for your next guest and send them the link or QR code.
        </p>
      </div>
    );
  }
  return (
    <div className="relative overflow-x-auto rounded-2xl border bg-card shadow-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Guest guides</caption>
        <thead className="border-b bg-tint text-left text-xs tracking-wide text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Guest
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Dates
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Viewed
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              Questions
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const name = row.firstName || "Guest";
            const url = `${origin}/g/${row.token}`;
            const status = STATUS[row.status];
            return (
              <tr key={row.id} className="align-middle transition-colors hover:bg-tint/60">
                <th scope="row" className="px-4 py-3 text-left font-semibold">
                  <span className="flex items-center gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand"
                      aria-hidden
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex flex-col">
                      {name}
                      <span className="text-xs font-normal whitespace-nowrap text-ink-muted">
                        {SOURCE[row.source] ? `${SOURCE[row.source]} · ` : ""}
                        Created {shortDate(row.createdAt)}
                      </span>
                    </span>
                  </span>
                </th>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatStayDates(row.checkIn, row.checkOut) ?? (
                    <span className="text-ink-muted">Not set</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn("rounded-full", status.className)}>
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    {status.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.viewedAt ? (
                    shortDate(row.viewedAt)
                  ) : (
                    <span className="text-ink-muted">Not yet</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.questions}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <CopyButton value={url} label={`Copy link for ${name}`} compact />
                    <QrDialog
                      title={`${name}'s guide`}
                      url={url}
                      qrSrc={`/host/guides/${row.id}/qr`}
                      printHref={`/host/guides/${row.id}/print`}
                      triggerLabel={`QR code for ${name}`}
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/host/guides/${row.id}/print`}
                        aria-label={`Print card for ${name}`}
                      >
                        <Printer aria-hidden />
                        <span className="hidden lg:inline">Print</span>
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/g/${row.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View guide for ${name}`}
                      >
                        <ExternalLink aria-hidden />
                        <span className="hidden lg:inline">View</span>
                      </a>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
