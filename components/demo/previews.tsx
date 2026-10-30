import { ArrowRight, Scale } from "lucide-react";
import Link from "next/link";

import { SectionArt } from "@/components/guide/cards";
import { SECTION_ICON, SECTION_TEXT } from "@/components/guide/sections";
import { Button } from "@/components/ui/button";
import { FallbackImage } from "@/components/ui/fallback-image";
import { copy, fill } from "@/lib/copy";
import type { DemoGuide } from "@/lib/demo/data";
import { previewSections, type PreviewSection } from "@/lib/demo/rules";
import type { GuideItem } from "@/lib/guide/types";
import { cn } from "@/lib/utils";

const t = copy.demo;

const sectionTitle = (section: PreviewSection["section"]) =>
  t.sections[section as keyof typeof t.sections] ?? section;

const greeting = (guide: DemoGuide) =>
  guide.firstName
    ? fill(copy.guest.welcome.greetingNamed, { name: guide.firstName })
    : copy.guest.welcome.greeting;

/** Photos for the preview rows, looked up from the guide's own sections. */
function imagesOf(guide: DemoGuide) {
  const byId = new Map<string, GuideItem>();
  for (const section of guide.view?.sections ?? []) {
    for (const item of section.items) byId.set(item.entity_id, item);
  }
  return (id: string) => byId.get(id)?.image_url ?? null;
}

function Thumb({
  section,
  image,
  className,
  size,
}: {
  section: PreviewSection["section"];
  image: string | null;
  className: string;
  size: number;
}) {
  return (
    <FallbackImage
      src={image}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      fallback={<SectionArt section={section} small className={cn("shrink-0", className)} />}
    />
  );
}

/** L1: a phone-shaped preview of a real demo guide: greeting, then photo rows per section. */
export function PhonePreview({ guide }: { guide: DemoGuide }) {
  const sections = previewSections(guide.view?.sections ?? [], 2).filter(
    (s) => s.section !== "films",
  );
  const image = imagesOf(guide);
  return (
    <figure className="flex w-full min-w-0 flex-col items-center gap-4">
      <div className="w-full max-w-[18.5rem] overflow-hidden rounded-[2.5rem] border-[9px] border-ink bg-bg shadow-float dark:border-tint-strong">
        <div className="flex flex-col gap-4 px-4 pt-3 pb-5">
          <div className="mx-auto h-1.5 w-16 rounded-full bg-line" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="text-lg font-bold tracking-tight">{greeting(guide)}</p>
            {guide.view?.heroLine && (
              <p className="line-clamp-2 text-xs text-ink-muted">{guide.view.heroLine}</p>
            )}
          </div>
          {sections.map((s) => {
            const Icon = SECTION_ICON[s.section];
            return (
              <section key={s.section} className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                  <Icon className={cn("size-3.5", SECTION_TEXT[s.section])} aria-hidden />
                  {sectionTitle(s.section)}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {s.items.map((item) => (
                    <li key={item.entity_id} className="flex min-w-0 items-center gap-2.5">
                      <Thumb
                        section={s.section}
                        image={image(item.entity_id)}
                        size={36}
                        className={cn(
                          "size-9",
                          s.section === "playlist" ? "rounded-full" : "rounded-lg",
                        )}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-semibold">{item.name}</span>
                        {item.category && (
                          <span className="truncate text-[11px] text-ink-muted">
                            {item.category}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      <figcaption className="text-sm font-semibold">{guide.spec.label}</figcaption>
    </figure>
  );
}

/** L1 fallback before the demo is seeded: the same shape, no data. */
export function PhoneSkeleton() {
  return (
    <div className="w-full max-w-[18.5rem] rounded-[2.5rem] border-[9px] border-ink bg-bg px-4 pt-3 pb-5 shadow-float dark:border-tint-strong">
      <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-line" />
      <div className="mb-5 h-6 w-2/3 rounded-full bg-tint" />
      {["bg-section-eat", "bg-section-drink", "bg-section-do", "bg-section-media"].map((dot) => (
        <div key={dot} className="mb-4 flex flex-col gap-2">
          <span className={cn("h-2 w-12 rounded-full", dot)} />
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center gap-2.5">
              <span className="size-9 rounded-lg bg-tint" />
              <span className="h-3 flex-1 rounded-full bg-tint" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** L2: one demo guest's guide, summarised, with links to the full guide and compare view. */
export function GuideColumn({ guide }: { guide: DemoGuide }) {
  const view = guide.view;
  const image = imagesOf(guide);
  return (
    <article
      aria-labelledby={`guest-${guide.key}`}
      className="flex h-full flex-col gap-6 rounded-3xl border bg-surface p-5 shadow-card sm:p-7"
    >
      <header className="flex flex-col gap-2">
        <h2 id={`guest-${guide.key}`} className="text-title">
          {guide.spec.label}
        </h2>
        {view?.heroLine && <p className="text-lg text-ink-muted">“{view.heroLine}”</p>}
      </header>

      {view ? (
        <>
          {view.signals.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{t.taste}</p>
              <ul className="flex flex-wrap gap-1.5">
                {view.signals.slice(0, 9).map((signal) => (
                  <li
                    key={signal}
                    className="inline-flex h-8 items-center rounded-full bg-tint px-3 text-sm font-medium"
                  >
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-5">
            {previewSections(view.sections).map((s) => {
              const Icon = SECTION_ICON[s.section];
              return (
                <section key={s.section} className="flex flex-col gap-2.5">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <Icon className={cn("size-4", SECTION_TEXT[s.section])} aria-hidden />
                    {sectionTitle(s.section)}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {s.items.map((item) => (
                      <li key={item.entity_id} className="flex min-w-0 items-center gap-3">
                        <Thumb
                          section={s.section}
                          image={image(item.entity_id)}
                          size={48}
                          className={cn(
                            "size-12",
                            s.section === "playlist" ? "rounded-full" : "rounded-xl",
                          )}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{item.name}</span>
                          {item.category && (
                            <span className="truncate text-sm text-ink-muted">{item.category}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <div className="mt-auto flex flex-col gap-3 border-t pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button asChild>
                <Link href={`/g/${guide.token}`}>
                  {guide.firstName
                    ? fill(t.openGuide, { name: guide.firstName })
                    : t.openGuideNoName}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              {view.sections.some((s) => s.section === "eat") && (
                <Button asChild variant="outline">
                  <Link href={`/g/${guide.token}/compare`}>
                    <Scale aria-hidden />
                    {t.compare}
                  </Link>
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              {t.compareHint} {copy.common.pickedWithQloo}.
            </p>
          </div>
        </>
      ) : (
        <p className="text-ink-muted">{t.notReady}</p>
      )}
    </article>
  );
}
