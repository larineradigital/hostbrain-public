import { MapPin, MessageCircle, Music, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { copy, fill } from "@/lib/copy";
import type { GuestGuide } from "@/lib/guide/guest";

import { SkipButton } from "./skip-button";

const PERK_ICONS = [UtensilsCrossed, Music, MessageCircle];

/** G1: the first open of `/g/[token]`. */
export function Welcome({ guide }: { guide: GuestGuide }) {
  const t = copy.guest.welcome;
  const { property } = guide;
  return (
    <main className="mx-auto flex w-full max-w-reading flex-1 flex-col gap-8 px-4 pt-5 pb-10 sm:px-6">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LogoMark className="size-6" />
        {copy.common.appName}
      </p>

      <div className="relative overflow-hidden rounded-3xl bg-tint shadow-card">
        {property.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- host photos come from any host
          <img
            src={property.photoUrl}
            alt=""
            className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]"
          />
        ) : (
          <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 overflow-hidden bg-brand-soft sm:aspect-[16/9]">
            <span
              className="absolute -top-16 -left-16 size-64 rounded-full border-[28px] border-brand opacity-10"
              aria-hidden
            />
            <span
              className="absolute -right-10 -bottom-20 size-72 rounded-full border-[36px] border-brand opacity-10"
              aria-hidden
            />
            <span className="relative flex size-16 items-center justify-center rounded-2xl bg-surface text-brand shadow-float">
              <MapPin className="size-8" aria-hidden />
            </span>
            <span className="relative text-display font-bold">{property.city}</span>
          </div>
        )}
        <p className="absolute bottom-3 left-3 rounded-full bg-surface px-3.5 py-1.5 text-sm font-semibold shadow-card">
          {property.name}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-display">
          {guide.guestFirstName
            ? fill(t.greetingNamed, { name: guide.guestFirstName })
            : t.greeting}
        </h1>
        <p className="text-lg text-ink-muted">
          {guide.hostName
            ? fill(t.intro, { host: guide.hostName, city: property.city })
            : fill(t.introNoHost, { city: property.city })}
        </p>
      </div>

      <section aria-labelledby="welcome-perks" className="flex flex-col gap-3">
        <h2 id="welcome-perks" className="text-base">
          {t.perksLabel}
        </h2>
        <ul className="flex flex-col gap-3">
          {t.perks.map((perk, i) => {
            const Icon = PERK_ICONS[i] ?? MapPin;
            return (
              <li key={perk} className="flex items-center gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tint"
                  aria-hidden
                >
                  <Icon className="size-[18px] text-brand" />
                </span>
                {perk}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-auto flex flex-col items-stretch gap-2 pt-2 sm:items-start">
        <Button asChild size="lg" className="sm:min-w-64">
          <Link href={`/g/${guide.token}/quiz`}>{t.start}</Link>
        </Button>
        <SkipButton token={guide.token} className="self-center sm:self-start" />
        <p className="text-center text-xs text-ink-muted sm:text-left">
          {copy.common.pickedWithQloo}
        </p>
      </div>
    </main>
  );
}
