import { ChevronLeft, CircleCheck, CircleHelp, CircleX, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copy, fill } from "@/lib/copy";
import { formatDistance } from "@/lib/geo/distance";
import { audienceBandLabel, displayNamesIn } from "@/lib/guide/format";
import type { AiAlonePick, CompareSummary, ComparisonView } from "@/lib/guide/compare";
import type { GuestGuide } from "@/lib/guide/guest";
import type { GuideView, GuideViewSection } from "@/lib/guide/view";
import { whyPayloadFor } from "@/lib/guide/why";
import { cn } from "@/lib/utils";

import { PlaceCard } from "./cards";
import { WhyThisProvider } from "./why-this";

const t = copy.guest.compare;

const picks = (count: number) => (count === 1 ? t.pick : fill(t.picks, { count }));

/** The two summary lines, from measured numbers only. */
export function summaryLines(summary: CompareSummary, radiusM: number) {
  const { ai, qloo, others } = summary;
  const aiLine = fill(t.summaryAi, {
    picks: picks(ai.picks),
    notFound: ai.notFound,
    generic: others.ai > 0 ? fill(t.summaryAiGeneric, { generic: ai.generic }) : "",
  });
  const qlooLine = fill(t.summaryQloo, {
    picks: picks(qloo.picks),
    verified:
      qloo.verified === qloo.picks
        ? t.summaryQlooAllVerified
        : fill(t.summaryQlooVerified, {
            verified: qloo.verified,
            radius: formatDistance(radiusM),
          }),
    unique: others.qloo > 0 ? fill(t.summaryQlooUnique, { unique: qloo.unique }) : "",
  });
  return { aiLine, qlooLine, hasOthers: others.ai > 0 || others.qloo > 0 };
}

const STATUS_STYLE: Record<AiAlonePick["status"], { icon: typeof CircleCheck; className: string }> =
  {
    verified: { icon: CircleCheck, className: "bg-olive/15 text-olive" },
    not_found: { icon: CircleX, className: "bg-brand-soft text-brand" },
    unchecked: { icon: CircleHelp, className: "bg-tint text-ink-muted" },
  };

function StatusPill({ status }: { status: AiAlonePick["status"] }) {
  const { icon: Icon, className } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t.status[status]}
    </span>
  );
}

/** AI-alone names: text labels with their status, never cards (hard rule: not Qloo picks). */
function AiAloneList({ comparison }: { comparison: Extract<ComparisonView, { state: "ready" }> }) {
  const generic = new Set(comparison.generic);
  return (
    <ol
      aria-label={t.aiAlone}
      className="flex flex-col divide-y rounded-2xl border bg-surface shadow-card"
    >
      {comparison.aiAlone.map((pick) => (
        <li key={pick.name} className="flex flex-col gap-1.5 px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{pick.name}</span>
            <StatusPill status={pick.status} />
          </div>
          {pick.status === "verified" && pick.distance_m !== null && (
            <p className="text-sm text-ink-muted">
              {pick.qloo_name && pick.qloo_name !== pick.name
                ? fill(t.foundAs, {
                    name: pick.qloo_name,
                    distance: formatDistance(pick.distance_m),
                  })
                : fill(t.found, { distance: formatDistance(pick.distance_m) })}
            </p>
          )}
          {generic.has(pick.name) && <p className="text-sm text-ink-muted">{t.generic}</p>}
        </li>
      ))}
    </ol>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-ink-muted">
      {children}
    </p>
  );
}

async function AiAloneColumn({
  comparison,
  radiusM,
}: {
  comparison: Promise<ComparisonView>;
  radiusM: number;
}) {
  const result = await comparison;
  if (result.state === "unavailable") return <Notice>{t.unavailable}</Notice>;
  if (result.state === "failed") return <Notice>{t.failed}</Notice>;
  return (
    <>
      <p className="text-sm text-ink-muted">
        {fill(t.aiAloneHint, {
          guest: displayNamesIn(result.guest),
          radius: formatDistance(radiusM),
        })}
      </p>
      <AiAloneList comparison={result} />
    </>
  );
}

async function SummaryCard({
  comparison,
  radiusM,
}: {
  comparison: Promise<ComparisonView>;
  radiusM: number;
}) {
  const result = await comparison;
  if (result.state !== "ready") return null;
  const { aiLine, qlooLine, hasOthers } = summaryLines(result.summary, radiusM);
  const measured = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(result.generatedAt));
  return (
    <section
      aria-labelledby="compare-summary"
      className="flex flex-col gap-4 rounded-3xl border bg-surface p-5 shadow-card sm:p-7"
    >
      <h2 id="compare-summary" className="text-heading">
        {t.summaryTitle}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <p className="flex items-start gap-3 rounded-2xl bg-tint p-4">
          <CircleX className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
          {aiLine}
        </p>
        <p className="flex items-start gap-3 rounded-2xl bg-brand-soft p-4 text-ink">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          {qlooLine}
        </p>
      </div>
      {!hasOthers && <p className="text-sm text-ink-muted">{t.summaryNoOthers}</p>}
      <p className="text-xs text-ink-muted">{fill(t.measured, { date: measured })}</p>
    </section>
  );
}

function QlooColumn({
  eat,
  guide,
  view,
}: {
  eat: GuideViewSection;
  guide: GuestGuide;
  view: GuideView;
}) {
  return (
    <ol aria-label={t.withQloo} className="flex flex-col gap-3">
      {eat.items.map((item, i) => (
        <li key={item.entity_id} className="flex flex-col [&>article]:flex-1">
          <PlaceCard
            compact
            item={item}
            section="eat"
            why={whyPayloadFor(item, {
              section: "eat",
              rank: i + 1,
              total: eat.items.length,
              radiusM: eat.radiusM,
            })}
            city={view.property.city}
            countryCode={view.property.countryCode}
            hostName={guide.hostName}
          />
        </li>
      ))}
    </ol>
  );
}

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <p className="text-sm text-ink-muted">{t.loading}</p>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-tint" />
      ))}
    </div>
  );
}

/**
 * G7: AI alone vs. with Qloo. Two columns on desktop, tabs on mobile, summary on top. The
 * Qloo column renders at once; the AI-alone column and the summary stream in.
 */
export function Compare({
  guide,
  view,
  comparison,
  radiusM,
}: {
  guide: GuestGuide;
  view: GuideView;
  /** Null when the guide has no Eat section. */
  comparison: Promise<ComparisonView> | null;
  radiusM: number;
}) {
  const eat = view.sections.find((s) => s.section === "eat");
  const twins = audienceBandLabel(view.audienceAgeBand);
  return (
    <WhyThisProvider
      city={view.property.city}
      ageBand={view.ageBand}
      audienceAgeBand={view.audienceAgeBand}
      guestSignals={view.signals}
    >
      <main className="mx-auto flex w-full max-w-dashboard flex-1 flex-col gap-8 px-4 pt-4 pb-16 sm:px-6 sm:pt-6">
        <Link
          href={`/g/${guide.token}`}
          className="-ml-3 flex min-h-11 w-fit items-center gap-1 rounded-full px-3 text-sm font-semibold hover:bg-tint"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t.back}
        </Link>
        <header className="flex flex-col gap-3">
          <h1 className="text-[2.25rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
            {t.title}
          </h1>
          <p className="max-w-prose text-lg text-ink-muted">{t.intro}</p>
        </header>

        {!eat || !comparison ? (
          <Notice>{t.noEat}</Notice>
        ) : (
          <>
            <Suspense fallback={<div className="h-44 animate-pulse rounded-3xl bg-tint" />}>
              <SummaryCard comparison={comparison} radiusM={radiusM} />
            </Suspense>

            <Tabs defaultValue="ai" className="gap-4">
              <TabsList aria-label={t.tabsLabel} className="w-full md:hidden">
                <TabsTrigger value="ai">{t.aiAlone}</TabsTrigger>
                <TabsTrigger value="qloo">{t.withQloo}</TabsTrigger>
              </TabsList>
              <div className="md:grid md:grid-cols-2 md:gap-10">
                <TabsContent
                  value="ai"
                  forceMount
                  className="flex flex-col gap-3 data-[state=inactive]:hidden md:data-[state=inactive]:flex"
                >
                  <h2 className="hidden text-title md:block">{t.aiAlone}</h2>
                  <Suspense fallback={<ColumnSkeleton />}>
                    <AiAloneColumn comparison={comparison} radiusM={radiusM} />
                  </Suspense>
                </TabsContent>
                <TabsContent
                  value="qloo"
                  forceMount
                  className="flex flex-col gap-3 data-[state=inactive]:hidden md:data-[state=inactive]:flex"
                >
                  <h2 className="hidden text-title md:block">{t.withQloo}</h2>
                  <p className="text-sm text-ink-muted">{t.withQlooHint}</p>
                  {twins && (
                    <p
                      className="flex items-start gap-2 text-sm text-ink-muted"
                      data-testid="compare-taste-twins"
                    >
                      <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {fill(t.tasteTwins, { band: twins })}
                    </p>
                  )}
                  <QlooColumn eat={eat} guide={guide} view={view} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </main>
    </WhyThisProvider>
  );
}
