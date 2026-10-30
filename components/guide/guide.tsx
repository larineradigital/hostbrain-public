import { CalendarDays, Home, KeyRound, Music, Scale } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { preconnect } from "react-dom";

import { LogoMark } from "@/components/brand/logo";
import type { GuidePin, PinSection } from "@/components/map/guide-map";
import { SectionHeader } from "@/components/ui/section-header";
import type { ChatMessageView } from "@/lib/ai/chat";
import { copy, fill } from "@/lib/copy";
import { formatStayDates, spotifySearchUrl } from "@/lib/guide/format";
import type { GuestGuide } from "@/lib/guide/guest";
import type { GuideItem, SectionKind } from "@/lib/guide/types";
import type { GuideView, GuideViewSection } from "@/lib/guide/view";
import { whyPayloadFor } from "@/lib/guide/why";
import { cn } from "@/lib/utils";

import { MediaTile, PlaceCard, PlaylistRow, SectionArt } from "./cards";
import { Concierge } from "./concierge";
import { MapSection } from "./map-section";
import { SectionNav, type NavItem } from "./section-nav";
import { SECTION_ICON, SECTION_TEXT } from "./sections";
import { WeatherChip } from "./weather-chip";
import { QlooBadge, WhyThisProvider } from "./why-this";

const t = copy.guest.guide;

type NavKey = Exclude<keyof typeof t.nav & keyof typeof t.sections, "label">;

/** Anchor ids, in nav order. */
const ANCHOR: Record<NavKey, string> = {
  eat: "eat",
  drink: "drink",
  do: "do",
  rainy: "rainy",
  host_picks: "host-picks",
  playlist: "playlist",
  films: "films",
  map: "map",
};

/** Page gutter and width, shared by every band of the page. */
const WRAP = "mx-auto w-full max-w-guide px-4 sm:px-6";

const whyPayload = (item: GuideItem, index: number, section: GuideViewSection) =>
  whyPayloadFor(item, {
    section: section.section,
    rank: index + 1,
    total: section.items.length,
    radiusM: section.radiusM,
  });

/** Pins for the map: places with coordinates, once each (a host pick keeps its star). */
function mapPins(sections: GuideViewSection[]): GuidePin[] {
  const seen = new Set<string>();
  const order: PinSection[] = ["host_picks", "eat", "drink", "do", "rainy"];
  return order.flatMap((kind) => {
    const section = sections.find((s) => s.section === kind);
    if (!section) return [];
    return section.items.flatMap((item) => {
      if (item.lat === null || item.lng === null || seen.has(item.entity_id)) return [];
      seen.add(item.entity_id);
      return [{ id: item.entity_id, name: item.name, section: kind, lat: item.lat, lng: item.lng }];
    });
  });
}

/** The hero mosaic (tablet and up): the top pick of each place section, with a photo. */
function mosaicPicks(places: GuideViewSection[]) {
  const picks: Array<{ item: GuideItem; section: SectionKind }> = [];
  for (let rank = 0; picks.length < 5 && rank < 3; rank++) {
    for (const section of places) {
      const item = section.items[rank];
      if (item?.image_url && !picks.some((p) => p.item.entity_id === item.entity_id)) {
        picks.push({ item, section: section.section });
      }
      if (picks.length === 5) break;
    }
  }
  return picks.length === 5 ? picks : [];
}

/**
 * Photos as CSS backgrounds that only apply from `md` up, so phones never download them
 * (a lazy <img> inside a hidden grid is still fetched). The section art sits underneath and
 * shows through if a photo fails.
 */
function Mosaic({ picks }: { picks: ReturnType<typeof mosaicPicks> }) {
  if (!picks.length) return null;
  return (
    <ul
      aria-hidden
      className="hidden h-[340px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl md:grid lg:h-[400px]"
    >
      {picks.map(({ item, section }, i) => (
        <li key={item.entity_id} className={cn("relative", i === 0 && "col-span-2 row-span-2")}>
          <SectionArt section={section} className="size-full" />
          <span
            className="absolute inset-0 bg-cover bg-center md:bg-[image:var(--photo)]"
            style={{ "--photo": `url(${JSON.stringify(item.image_url)})` } as CSSProperties}
          />
        </li>
      ))}
    </ul>
  );
}

function Section({
  id,
  kind,
  title,
  intro,
  action,
  children,
}: {
  id: string;
  kind: NavKey | "films";
  title: string;
  intro?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-5">
      <SectionHeader
        id={id}
        title={title}
        intro={intro}
        icon={SECTION_ICON[kind]}
        tone={SECTION_TEXT[kind]}
        action={action}
      />
      {children}
    </section>
  );
}

/**
 * Cards: a swipeable row on phones, a grid from `sm` up. Positioned, so absolutely placed
 * children (sr-only text) are clipped by the row instead of widening the page.
 */
function CardRow({ children }: { children: ReactNode }) {
  return (
    <ul className="relative -mx-4 no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children}
    </ul>
  );
}

/** G4: the guest's guide, server-rendered from `guide_sections`, with the concierge (G6). */
export function Guide({
  guide,
  view,
  chat,
  showCompare = false,
}: {
  guide: GuestGuide;
  view: GuideView;
  chat: ChatMessageView[];
  /** Demo mode: link to the AI-alone comparison (G7) for judges. */
  showCompare?: boolean;
}) {
  const { property } = view;
  const get = (kind: SectionKind) => view.sections.find((s) => s.section === kind);
  const places = (["eat", "drink", "do", "rainy", "host_picks"] as const).flatMap((kind) => {
    const section = get(kind);
    return section ? [section] : [];
  });
  const playlist = get("playlist");
  const films = get("films");
  const shows = get("shows");
  const pins = mapPins(view.sections);
  const dates = formatStayDates(view.checkIn, view.checkOut);
  const lead = places[0]?.items[0];
  // The first photo is the largest paint on phones: open its connection early.
  if (lead?.image_url && URL.canParse(lead.image_url)) preconnect(new URL(lead.image_url).origin);

  const navKeys: NavKey[] = [
    ...places.map((s) => s.section as NavKey),
    ...(playlist ? (["playlist"] as const) : []),
    ...(films || shows ? (["films"] as const) : []),
    ...(pins.length ? (["map"] as const) : []),
  ];
  const nav: NavItem[] = navKeys.map((key) => ({ key, id: ANCHOR[key], label: t.nav[key] }));

  return (
    <WhyThisProvider
      city={property.city}
      ageBand={view.ageBand}
      audienceAgeBand={view.audienceAgeBand}
      guestSignals={view.signals}
    >
      <main className="flex flex-1 flex-col pb-28">
        <header className={cn(WRAP, "flex flex-col gap-6 pt-5 pb-6 sm:pt-8")}>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <LogoMark className="size-6" />
            {copy.common.appName}
          </p>
          <div className="flex flex-col gap-3">
            <p className="text-lg text-ink-muted">
              {guide.guestFirstName
                ? fill(t.greetingNamed, { name: guide.guestFirstName })
                : t.greeting}
            </p>
            <h1 className="max-w-3xl text-[2rem] leading-[1.1] tracking-tight text-balance sm:text-display lg:text-5xl lg:leading-[1.05]">
              {view.heroLine || fill(t.heroFallback, { city: property.city })}
            </h1>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 text-ink-muted">
              <Home className="size-4 shrink-0" aria-hidden />
              {fill(t.stayAt, { property: property.name })}
              {dates && (
                <>
                  {" · "}
                  <CalendarDays className="size-4 shrink-0" aria-hidden />
                  {dates}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <WeatherChip token={guide.token} />
            <QlooBadge />
          </div>
          <Mosaic picks={mosaicPicks(places)} />
        </header>

        <SectionNav items={nav} label={t.nav.label} />

        <div className={cn(WRAP, "flex flex-col gap-14 pt-8 sm:gap-16 sm:pt-10")}>
          {places.map((section) => {
            const key = section.section as NavKey;
            return (
              <Section
                key={key}
                id={ANCHOR[key]}
                kind={key}
                title={t.sections[key]}
                intro={section.intro}
              >
                <CardRow>
                  {section.items.map((item, i) => (
                    <li
                      key={item.entity_id}
                      className="flex w-[82%] max-w-80 shrink-0 snap-start flex-col sm:w-auto sm:max-w-none"
                    >
                      <PlaceCard
                        item={item}
                        section={section.section}
                        why={whyPayload(item, i, section)}
                        city={property.city}
                        countryCode={property.countryCode}
                        hostName={guide.hostName}
                        ribbon={section.section === "host_picks" && i === 0}
                        priority={item === lead}
                      />
                    </li>
                  ))}
                </CardRow>
              </Section>
            );
          })}

          {playlist && (
            <Section
              id={ANCHOR.playlist}
              kind="playlist"
              title={t.sections.playlist}
              intro={playlist.intro}
              action={
                <a
                  href={spotifySearchUrl(playlist.items[0].name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-85"
                >
                  <Music className="size-4" aria-hidden />
                  {t.playlist.playAll}
                </a>
              }
            >
              <ul className="grid grid-cols-1 rounded-2xl border bg-surface px-3 py-1.5 shadow-card sm:px-4 lg:grid-cols-2 lg:gap-x-8 [&>li]:border-b [&>li:last-child]:border-0 lg:[&>li:nth-last-child(2):nth-child(odd)]:border-0">
                {playlist.items.map((item, i) => (
                  <PlaylistRow
                    key={item.entity_id}
                    item={item}
                    why={whyPayload(item, i, playlist)}
                  />
                ))}
              </ul>
            </Section>
          )}

          {(films || shows) && (
            <Section
              id={ANCHOR.films}
              kind="films"
              title={t.sections.films}
              intro={films?.intro || shows?.intro}
            >
              {[
                { section: films, kind: "films" as const, title: t.media.films },
                { section: shows, kind: "shows" as const, title: t.media.shows },
              ].map(
                ({ section, kind, title }) =>
                  section && (
                    <div key={kind} className="flex flex-col gap-3">
                      <h3 className="text-base font-semibold">{title}</h3>
                      <ul
                        aria-label={title}
                        className="relative -mx-4 no-scrollbar flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6"
                      >
                        {section.items.map((item, i) => (
                          <MediaTile
                            key={item.entity_id}
                            item={item}
                            section={kind}
                            why={whyPayload(item, i, section)}
                          />
                        ))}
                      </ul>
                    </div>
                  ),
              )}
            </Section>
          )}

          {pins.length > 0 && (
            <Section id={ANCHOR.map} kind="map" title={t.sections.map}>
              <MapSection
                home={{ lat: property.lat, lng: property.lng }}
                pins={pins}
                heatmap={view.heatmap}
              />
            </Section>
          )}
        </div>

        <footer className={cn(WRAP, "mt-16 flex flex-col gap-8 text-sm")}>
          {property.houseNotes && (
            <section
              aria-labelledby="house-notes"
              className="flex flex-col gap-3 rounded-2xl bg-tint p-5 sm:p-6"
            >
              <h2 id="house-notes" className="flex items-center gap-2 text-heading">
                <KeyRound className="size-5 text-brand" aria-hidden />
                {t.footer.houseNotes}
              </h2>
              <p className="text-base whitespace-pre-line">{property.houseNotes}</p>
            </section>
          )}
          <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
            <div className="flex max-w-reading flex-col gap-3 text-ink-muted">
              <p>{t.footer.privacy}</p>
              <p className="flex items-center gap-2 font-medium text-ink">
                <LogoMark className="size-5" />
                {copy.common.pickedWithQloo} · {copy.common.madeWith}
              </p>
            </div>
            {showCompare && view.sections.some((s) => s.section === "eat") && (
              <Link
                href={`/g/${guide.token}/compare`}
                className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-xl border border-line-strong px-4 font-semibold transition-colors hover:border-ink hover:bg-tint"
              >
                <Scale className="size-4" aria-hidden />
                {t.footer.compare}
              </Link>
            )}
          </div>
        </footer>
      </main>
      <Concierge
        guideId={guide.id}
        token={guide.token}
        city={property.city}
        countryCode={property.countryCode}
        hostName={guide.hostName}
        initialMessages={chat}
      />
    </WhyThisProvider>
  );
}
