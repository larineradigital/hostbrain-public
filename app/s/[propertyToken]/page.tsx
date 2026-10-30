import { MapPin, QrCode } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";

import { SelfServeForm } from "@/components/guest/self-serve-form";
import { copy, fill } from "@/lib/copy";
import { getSelfServeProperty } from "@/lib/guide/self-serve";

import { startSelfServe } from "./actions";

/** `/s/[propertyToken]`: a hotel's self-serve QR entry. No login. */
export default async function SelfServePage({ params }: PageProps<"/s/[propertyToken]">) {
  const { propertyToken } = await params;
  const t = copy.guest.selfServe;
  const property = await getSelfServeProperty(propertyToken);
  if (!property) {
    return (
      <main className="mx-auto flex w-full max-w-reading flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <span
          className="flex size-14 items-center justify-center rounded-2xl bg-tint text-ink-muted"
          aria-hidden
        >
          <QrCode className="size-7" />
        </span>
        <h1 className="text-title">{t.unavailableTitle}</h1>
        <p className="text-lg text-ink-muted">{t.unavailable}</p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-reading flex-1 flex-col gap-8 px-4 pt-5 pb-10 sm:px-6">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LogoMark className="size-6" />
        {copy.common.appName}
      </p>
      <div className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tint px-3 py-1.5 text-sm font-semibold">
          <MapPin className="size-4 text-brand" aria-hidden />
          {property.name}
        </p>
        <h1 className="text-display text-balance">{fill(t.title, { city: property.city })}</h1>
        <p className="text-lg text-ink-muted">{fill(t.intro, { property: property.name })}</p>
      </div>
      <div className="rounded-3xl border bg-surface p-5 shadow-card sm:p-7">
        <SelfServeForm action={startSelfServe.bind(null, propertyToken)} />
      </div>
      <p className="text-center text-xs text-ink-muted sm:text-left">
        {copy.common.pickedWithQloo}
      </p>
    </main>
  );
}
