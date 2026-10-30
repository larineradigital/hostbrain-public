"use client";

import { Info, MapPin, Sparkles, Star, Users } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { copy, fill } from "@/lib/copy";
import { formatDistance } from "@/lib/geo/distance";
import { ageBandLabel, audienceBandLabel } from "@/lib/guide/format";
import type { SectionKind } from "@/lib/guide/types";
import { cn } from "@/lib/utils";

const t = copy.guest.guide;

/** What one card hands the "Why this?" sheet (G5). Built on the server from the item. */
export interface WhyPayload {
  name: string;
  /** The "why you" line from the card. */
  whyYou: string;
  section: SectionKind;
  category: string | null;
  distanceM: number | null;
  /** The guest's signals behind this pick. */
  signals: string[];
  /** Qloo explainability: how much each of the guest's picks pulled this up. */
  explain: Array<{ name: string; score: number }>;
  rank: number;
  total: number;
  radiusM: number | null;
}

type Open = { kind: "item"; payload: WhyPayload } | { kind: "about" } | null;

const WhyContext = createContext<(open: Open) => void>(() => {});

interface WhyThisProviderProps {
  city: string;
  ageBand: string | null;
  /** Q11: the age band people who share the guest's picks skew towards, stored with the guide. */
  audienceAgeBand?: string | null;
  /** The guest's quiz picks by name. */
  guestSignals: string[];
  children: ReactNode;
}

/** One sheet for the whole guide; cards open it through context. */
export function WhyThisProvider({
  city,
  ageBand,
  audienceAgeBand = null,
  guestSignals,
  children,
}: WhyThisProviderProps) {
  const [open, setOpen] = useState<Open>(null);
  return (
    <WhyContext value={setOpen}>
      {children}
      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-reading gap-0 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:border-x"
        >
          {open?.kind === "item" && <ItemReasons payload={open.payload} ageBand={ageBand} />}
          {open?.kind === "about" && (
            <AboutReasons
              city={city}
              ageBand={ageBand}
              audienceAgeBand={audienceAgeBand}
              signals={guestSignals}
            />
          )}
          <p className="mx-5 mt-4 flex gap-2.5 rounded-xl bg-tint p-4 text-sm text-ink-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {copy.common.limitsLine}
          </p>
        </SheetContent>
      </Sheet>
    </WhyContext>
  );
}

const SECTION_NAME: Record<SectionKind, string> = {
  eat: t.nav.eat,
  drink: t.nav.drink,
  do: t.nav.do,
  rainy: t.nav.rainy,
  host_picks: t.nav.host_picks,
  playlist: t.nav.playlist,
  films: t.media.films,
  shows: t.media.shows,
};

function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-tint px-3.5 py-1.5 text-sm font-medium">
      {icon}
      {children}
    </li>
  );
}

function QlooLine() {
  return (
    <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
      <Sparkles className="size-3.5" aria-hidden />
      {copy.common.pickedWithQloo}
    </p>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t px-5 py-5" aria-labelledby={id}>
      <h3 id={id} className="text-base font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ItemReasons({ payload, ageBand }: { payload: WhyPayload; ageBand: string | null }) {
  const isPlace = payload.distanceM !== null || payload.radiusM !== null;
  const facts = [
    payload.category && fill(t.why.category, { category: payload.category }),
    payload.distanceM !== null &&
      fill(t.why.fromStay, { distance: formatDistance(payload.distanceM) }),
  ].filter(Boolean);
  const top = Math.max(...payload.explain.map((e) => e.score), 0);
  return (
    <>
      <SheetHeader className="gap-2 pr-14 pb-5">
        <QlooLine />
        <SheetTitle className="text-title">{payload.name}</SheetTitle>
        <SheetDescription>{facts.join(" · ") || t.why.title}</SheetDescription>
        {payload.whyYou && (
          <p className="mt-1 border-l-2 border-brand pl-3 text-base leading-relaxed">
            {payload.whyYou}
          </p>
        )}
      </SheetHeader>

      <Block id="why-signals" title={t.why.signals}>
        <ul className="flex flex-wrap gap-2">
          {payload.section === "host_picks" && (
            <Chip icon={<Star className="size-3.5 fill-brand text-brand" aria-hidden />}>
              {t.why.hostPick}
            </Chip>
          )}
          {payload.signals.map((signal) => (
            <Chip key={signal}>{signal}</Chip>
          ))}
          {ageBand && (
            <Chip icon={<Users className="size-3.5" aria-hidden />}>
              {fill(t.why.ageBand, { band: ageBandLabel(ageBand) })}
            </Chip>
          )}
          {isPlace && payload.radiusM !== null && (
            <Chip icon={<MapPin className="size-3.5" aria-hidden />}>
              {fill(t.why.radius, { distance: formatDistance(payload.radiusM) })}
            </Chip>
          )}
        </ul>
        {payload.signals.length === 0 && (
          <p className="text-sm text-ink-muted">{t.why.noSignals}</p>
        )}
      </Block>

      <Block id="why-match" title={t.why.match}>
        <p className="text-sm font-medium">
          {fill(t.why.rank, {
            rank: payload.rank,
            total: payload.total,
            section: SECTION_NAME[payload.section],
          })}
        </p>
        {payload.explain.length > 0 && top > 0 && (
          <>
            <p className="text-sm text-ink-muted">{t.why.pulls}</p>
            <ul className="flex flex-col gap-3">
              {payload.explain.slice(0, 4).map((e) => (
                <li key={e.name} className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">{e.name}</span>
                  <span className="h-2 w-full overflow-hidden rounded-full bg-tint" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(8, Math.round((e.score / top) * 100))}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Block>
    </>
  );
}

function AboutReasons({
  city,
  ageBand,
  audienceAgeBand,
  signals,
}: {
  city: string;
  ageBand: string | null;
  audienceAgeBand: string | null;
  signals: string[];
}) {
  const twins = audienceBandLabel(audienceAgeBand);
  return (
    <>
      <SheetHeader className="gap-2 pr-14 pb-5">
        <QlooLine />
        <SheetTitle className="text-title">{t.why.aboutTitle}</SheetTitle>
        <SheetDescription className="text-base leading-relaxed">
          {t.why.aboutIntro}
        </SheetDescription>
      </SheetHeader>
      <Block id="about-signals" title={t.why.aboutSignals}>
        <ul className="flex flex-wrap gap-2">
          {signals.map((signal) => (
            <Chip key={signal}>{signal}</Chip>
          ))}
          {ageBand && (
            <Chip icon={<Users className="size-3.5" aria-hidden />}>
              {fill(t.why.ageBand, { band: ageBandLabel(ageBand) })}
            </Chip>
          )}
          <Chip icon={<MapPin className="size-3.5" aria-hidden />}>
            {fill(t.why.city, { city })}
          </Chip>
        </ul>
        {signals.length === 0 && <p className="text-sm text-ink-muted">{t.why.noSignals}</p>}
      </Block>
      {twins && (
        <Block id="about-twins" title={t.why.tasteTwinsTitle}>
          <p className="text-sm font-medium" data-testid="taste-twins">
            {fill(t.why.tasteTwins, { band: twins })}
          </p>
          <p className="-mt-1 text-sm text-ink-muted">{t.why.tasteTwinsNote}</p>
        </Block>
      )}
    </>
  );
}

/** The "Why this?" action on a card. */
export function WhyButton({
  payload,
  iconOnly = false,
  className,
}: {
  payload: WhyPayload;
  iconOnly?: boolean;
  className?: string;
}) {
  const setOpen = use(WhyContext);
  return (
    <button
      type="button"
      onClick={() => setOpen({ kind: "item", payload })}
      aria-label={fill(t.card.whyThisFor, { name: payload.name })}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors hover:bg-tint",
        iconOnly ? "min-w-11 text-ink-muted hover:text-ink" : "px-3 text-ink",
        className,
      )}
    >
      <Info className="size-4" aria-hidden />
      {!iconOnly && (
        <span className="underline decoration-line-strong underline-offset-4">
          {t.card.whyThis}
        </span>
      )}
    </button>
  );
}

/** The "Picked with Qloo taste data" badge in the hero: opens the general explanation. */
export function QlooBadge() {
  const setOpen = use(WhyContext);
  return (
    <button
      type="button"
      onClick={() => setOpen({ kind: "about" })}
      aria-haspopup="dialog"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-soft px-4 text-sm font-semibold text-brand ring-1 ring-transparent transition-shadow ring-inset hover:ring-brand/40"
    >
      <Sparkles className="size-4" aria-hidden />
      {copy.common.pickedWithQloo}
    </button>
  );
}
