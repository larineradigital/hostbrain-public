import type { Metadata } from "next";
import { Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DemoTabs } from "@/components/demo/demo-tabs";
import { GuideColumn } from "@/components/demo/previews";
import { TryAsGuestButton } from "@/components/demo/try-as-guest";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { copy, fill } from "@/lib/copy";
import { fallbackDemoToken, loadDemoGuides } from "@/lib/demo/data";
import { DEMO_PAIR, demoProperty, DEMO_TRY_PROPERTY } from "@/lib/demo/personas";
import { placeOverlap } from "@/lib/demo/rules";
import { readServerEnv } from "@/lib/env";

const t = copy.demo;

export const metadata: Metadata = {
  title: t.title,
  description: copy.landing.subtitle,
};

const NOTES = ["paused", "busy", "missing"] as const;
type Note = (typeof NOTES)[number];

/** "Try as a guest", or why it opens a guide made earlier instead (replay mode, busy). */
async function TryPanel({ note }: { note: Note | null }) {
  const paused = readServerEnv().QLOO_MODE === "replay";
  const reason: Note | null = paused ? "paused" : note;
  const fallback = reason && reason !== "missing" ? await fallbackDemoToken() : null;
  return (
    <section
      id="try"
      aria-labelledby="try-title"
      className="flex scroll-mt-24 flex-col gap-4 rounded-3xl bg-tint p-6 sm:p-10"
    >
      <span
        className="flex size-12 items-center justify-center rounded-2xl bg-surface text-brand shadow-card"
        aria-hidden
      >
        <Sparkles className="size-5" />
      </span>
      <h2 id="try-title" className="text-title">
        {t.try.title}
      </h2>
      {reason ? (
        <>
          <p role="status">{t.try[reason]}</p>
          {fallback && (
            <Button asChild size="lg" className="w-full sm:w-fit">
              <Link href={`/g/${fallback}`}>{t.try.openReady}</Link>
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="max-w-xl text-lg text-ink-muted">{t.try.body}</p>
          <div className="flex">
            <TryAsGuestButton />
          </div>
        </>
      )}
    </section>
  );
}

async function DemoBody({ searchParams }: Pick<PageProps<"/demo">, "searchParams">) {
  const [params, guides] = await Promise.all([searchParams, loadDemoGuides(DEMO_PAIR)]);
  const note = NOTES.find((n) => n === params.note) ?? null;
  const property = demoProperty(DEMO_TRY_PROPERTY);
  const [a, b] = guides;
  const overlap = a?.view && b?.view ? placeOverlap(a.view.sections, b.view.sections) : null;

  return (
    <>
      <header className="flex flex-col gap-4">
        <h1 className="text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
          {t.title}
        </h1>
        {a && b && (
          <p className="max-w-2xl text-lg text-ink-muted sm:text-xl">
            {fill(t.subtitle, {
              a: a.spec.shortLabel,
              b: b.spec.shortLabel,
              property: property.name,
              city: property.city,
            })}
          </p>
        )}
        {overlap && (
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-soft px-4 py-2 font-semibold text-brand">
            <Shuffle className="size-4 shrink-0" aria-hidden />
            {overlap.shared
              ? fill(t.overlap, {
                  shared: overlap.shared,
                  total: Math.min(overlap.left, overlap.right),
                })
              : fill(t.overlapNone, { total: Math.min(overlap.left, overlap.right) })}
          </p>
        )}
      </header>

      {guides.length ? (
        <DemoTabs
          label={t.tabs}
          tabs={guides.map((guide) => ({
            id: guide.key,
            label: guide.spec.shortLabel,
            panel: <GuideColumn guide={guide} />,
          }))}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
          {t.empty}
        </p>
      )}

      <TryPanel note={note} />
    </>
  );
}

/** `/demo`: the two Lisbon demo guests side by side, plus "Try as a guest". */
export default function DemoPage({ searchParams }: PageProps<"/demo">) {
  const demoMode = readServerEnv().DEMO_MODE;
  return (
    <>
      <SiteHeader>
        {demoMode && (
          <Button asChild variant="ghost">
            <Link href="/login">{t.hostLogin}</Link>
          </Button>
        )}
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-dashboard flex-1 flex-col gap-10 px-4 py-10 sm:px-6 sm:py-16">
        <Suspense
          fallback={
            <div className="grid gap-6 lg:grid-cols-2" aria-hidden>
              <div className="h-96 animate-pulse rounded-3xl bg-tint" />
              <div className="hidden h-96 animate-pulse rounded-3xl bg-tint lg:block" />
            </div>
          }
        >
          <DemoBody searchParams={searchParams} />
        </Suspense>
        <p className="text-center text-xs text-ink-muted">
          {copy.common.pickedWithQloo}. {copy.common.limitsLine}
        </p>
      </main>
    </>
  );
}
