import { ArrowRight, Check, Link2, MapPin, QrCode, Scale, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { LogoMark } from "@/components/brand/logo";
import { SectionArt } from "@/components/guide/cards";
import { PhonePreview, PhoneSkeleton } from "@/components/demo/previews";
import { TryAsGuestButton } from "@/components/demo/try-as-guest";
import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FallbackImage } from "@/components/ui/fallback-image";
import { copy, fill } from "@/lib/copy";
import { loadDemoGuides } from "@/lib/demo/data";
import { DEMO_PAIR, demoProperty, DEMO_TRY_PROPERTY } from "@/lib/demo/personas";
import { readServerEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

const t = copy.landing;
const STEP_ICONS = [MapPin, Link2, Sparkles];

const PHONES = "grid grid-cols-1 justify-items-center gap-10 sm:grid-cols-2 sm:gap-6";

/** Section 2: the two Lisbon demo guides as phones, from the seeded data. */
async function DemoPhones() {
  const guides = (await loadDemoGuides(DEMO_PAIR)).filter((g) => g.view);
  if (guides.length < 2) {
    return (
      <>
        <div className={PHONES} aria-hidden>
          <PhoneSkeleton />
          <PhoneSkeleton />
        </div>
        <p className="text-center text-sm text-ink-muted">{t.mockups.placeholder}</p>
      </>
    );
  }
  const property = demoProperty(DEMO_TRY_PROPERTY);
  return (
    <>
      <div className={PHONES}>
        {guides.map((guide) => (
          <PhonePreview key={guide.key} guide={guide} />
        ))}
      </div>
      <p className="text-center text-sm text-ink-muted">
        {fill(t.mockups.caption, { property: property.name, city: property.city })}
      </p>
    </>
  );
}

/** The compare view of the first demo guest, or /demo before the demo is seeded. */
async function CompareLink() {
  const [first] = await loadDemoGuides(DEMO_PAIR);
  const href = first?.view ? `/g/${first.token}/compare` : "/demo";
  return <CompareButton href={href} />;
}

function CompareButton({ href }: { href: string }) {
  return (
    <Button asChild variant="outline">
      <Link href={href}>
        <Scale aria-hidden />
        {t.different.link}
      </Link>
    </Button>
  );
}

/**
 * Hero art (desktop): each demo guest's top restaurant as a tilted card, side by side.
 * Decorative: the same picks are in the phones below.
 */
async function HeroCards() {
  const guides = (await loadDemoGuides(DEMO_PAIR)).filter((g) => g.view);
  const cards = guides.flatMap((guide) => {
    const item = guide.view?.sections.find((s) => s.section === "eat")?.items[0];
    return item ? [{ guide, item }] : [];
  });
  if (cards.length < 2) return null;
  return (
    <div aria-hidden className="relative hidden h-[460px] lg:block">
      {cards.slice(0, 2).map(({ guide, item }, i) => (
        <div
          key={guide.key}
          className={cn(
            "absolute w-64 overflow-hidden rounded-2xl border bg-surface shadow-float",
            i === 0 ? "top-0 left-4 -rotate-3" : "top-24 right-2 rotate-3",
          )}
        >
          <FallbackImage
            src={item.image_url}
            alt=""
            width={256}
            height={192}
            className="aspect-[4/3] w-full"
            fallback={<SectionArt section="eat" className="aspect-[4/3] w-full" />}
          />
          <div className="flex flex-col gap-1.5 p-4">
            <span className="w-fit rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold">
              {guide.spec.shortLabel}
            </span>
            <span className="font-semibold">{item.name}</span>
            {item.why_you && (
              <span className="line-clamp-3 text-sm text-ink-muted">{item.why_you}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-title text-balance sm:text-[2.5rem] sm:leading-[1.1]">
      {children}
    </h2>
  );
}

/** The landing page. */
export default function LandingPage() {
  const { REPO_URL } = readServerEnv();
  return (
    <>
      <SiteHeader>
        <Button asChild variant="ghost">
          <Link href="/login">{t.hostLogin}</Link>
        </Button>
      </SiteHeader>
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-dashboard flex-col gap-24 px-4 pt-12 pb-20 sm:gap-32 sm:px-6 sm:pt-20">
          {/* 1. Hero */}
          <section
            aria-labelledby="hero-title"
            className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-8">
              <Badge variant="soft" className="h-8 gap-1.5 px-3 text-sm">
                <Sparkles className="size-3.5!" aria-hidden />
                {copy.common.pickedWithQloo}
              </Badge>
              <div className="flex flex-col gap-5">
                <h1
                  id="hero-title"
                  className="text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl xl:text-7xl"
                >
                  {t.title}
                </h1>
                <p className="max-w-2xl text-lg text-ink-muted sm:text-xl">{t.subtitle}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button asChild size="lg">
                  <Link href="/demo">
                    {t.seeDemo}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <TryAsGuestButton label={t.tryAsGuest} variant="outline" />
              </div>
            </div>
            <Suspense fallback={null}>
              <HeroCards />
            </Suspense>
          </section>

          {/* 2. Two guests, one flat */}
          <section
            aria-labelledby="mockups-title"
            className="-mx-4 flex flex-col gap-10 bg-tint px-4 py-12 sm:mx-0 sm:rounded-[2rem] sm:px-10 sm:py-16"
          >
            <div className="text-center">
              <SectionTitle id="mockups-title">{t.mockups.title}</SectionTitle>
            </div>
            <Suspense
              fallback={
                <div className={PHONES} aria-hidden>
                  <PhoneSkeleton />
                  <PhoneSkeleton />
                </div>
              }
            >
              <DemoPhones />
            </Suspense>
          </section>

          {/* 3. How it works */}
          <section aria-labelledby="how-title" className="flex flex-col gap-10">
            <SectionTitle id="how-title">{t.how.title}</SectionTitle>
            <ol className="grid gap-5 sm:grid-cols-3">
              {t.how.steps.map((step, i) => {
                const Icon = STEP_ICONS[i] ?? Sparkles;
                return (
                  <li
                    key={step.title}
                    className="flex flex-col gap-4 rounded-2xl border bg-surface p-6 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="text-4xl font-bold text-line-strong" aria-hidden>
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="text-heading">
                      <span className="sr-only">{i + 1}. </span>
                      {step.title}
                    </h3>
                    <p className="text-ink-muted">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* 4. Why it's different */}
          <section aria-labelledby="different-title" className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <SectionTitle id="different-title">{t.different.title}</SectionTitle>
              <p className="max-w-3xl text-lg text-ink-muted">{t.different.body}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                { title: t.different.aiAlone, line: t.different.aiAloneLine, qloo: false },
                { title: t.different.withQloo, line: t.different.withQlooLine, qloo: true },
              ].map((column) => (
                <div
                  key={column.title}
                  className={cn(
                    "flex items-start gap-4 rounded-2xl p-6",
                    column.qloo ? "border-2 border-brand bg-surface shadow-card" : "bg-tint",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      column.qloo ? "bg-brand text-accent-ink" : "bg-surface text-ink-muted",
                    )}
                    aria-hidden
                  >
                    {column.qloo ? <Check className="size-5" /> : <X className="size-5" />}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-heading">{column.title}</h3>
                    <p className="text-ink-muted">{column.line}</p>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Suspense fallback={<CompareButton href="/demo" />}>
                <CompareLink />
              </Suspense>
            </div>
          </section>

          {/* 5. For hotels */}
          <section
            aria-labelledby="hotels-title"
            className="grid items-center gap-10 rounded-[2rem] border bg-surface p-6 shadow-card sm:grid-cols-[1fr_auto] sm:p-12"
          >
            <div className="flex flex-col gap-5">
              <SectionTitle id="hotels-title">{t.hotels.title}</SectionTitle>
              <p className="max-w-2xl text-lg text-ink-muted">{t.hotels.body}</p>
              <ul className="flex flex-col gap-3">
                {t.hotels.points.map((point) => (
                  <li key={point} className="flex items-center gap-3 font-medium">
                    <span
                      className="flex size-6 items-center justify-center rounded-full bg-olive/15"
                      aria-hidden
                    >
                      <Check className="size-3.5 text-olive" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col items-center gap-3 justify-self-center rounded-3xl bg-tint p-6">
              <span className="flex size-36 items-center justify-center rounded-2xl bg-surface text-ink shadow-card">
                <QrCode className="size-24" strokeWidth={1.25} aria-hidden />
              </span>
              <LogoMark className="size-7" />
            </div>
          </section>

          {/* 6. Pricing */}
          <section aria-labelledby="pricing-title" className="flex flex-col gap-10">
            <SectionTitle id="pricing-title">{t.pricing.title}</SectionTitle>
            <ul className="grid gap-5 sm:grid-cols-3">
              {t.pricing.plans.map((plan, i) => (
                <li
                  key={plan.name}
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border bg-surface p-6 shadow-card",
                    i === 1 && "border-2 border-ink",
                  )}
                >
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-5xl font-bold tracking-tight">{plan.price}</span>
                    <span className="text-ink-muted">{plan.unit}</span>
                  </p>
                  <p className="text-sm text-ink-muted">{plan.line}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* 7. Footer */}
        <footer className="mt-auto border-t bg-tint">
          <div className="mx-auto flex w-full max-w-dashboard flex-col gap-3 px-4 py-10 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="flex items-center gap-2 font-medium text-ink">
              <LogoMark className="size-6" />
              {t.footer.builtWith}
            </p>
            <div className="flex flex-wrap items-center gap-x-5">
              <p>{t.footer.by}</p>
              {REPO_URL && (
                <a
                  href={REPO_URL}
                  className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4 hover:text-brand"
                >
                  {t.footer.github}
                </a>
              )}
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
