"use client";

import { Download, Printer, QrCode } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { CopyButton } from "./copy-button";

/** A QR code for a link, with download, print and copy. The SVG comes from a host-only route. */
export function QrDialog({
  title,
  url,
  qrSrc,
  printHref,
  triggerLabel,
}: {
  title: string;
  url: string;
  qrSrc: string;
  printHref: string;
  triggerLabel: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" aria-label={triggerLabel}>
          <QrCode aria-hidden />
          QR
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-all">{url}</DialogDescription>
        </DialogHeader>
        <QrImage src={qrSrc} alt={`QR code for ${title}`} />
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`${qrSrc}?download`} download>
              <Download aria-hidden />
              Download
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={printHref}>
              <Printer aria-hidden />
              Print card
            </Link>
          </Button>
          <CopyButton value={url} label={`Copy link for ${title}`} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QrImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an SVG from our own host-only route
    <img
      src={src}
      alt={alt}
      width={240}
      height={240}
      className="mx-auto size-60 rounded-2xl border bg-white p-3"
    />
  );
}
