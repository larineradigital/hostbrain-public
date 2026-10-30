import { MapPin, Star } from "lucide-react";

import { FallbackImage } from "@/components/ui/fallback-image";
import { copy, fill } from "@/lib/copy";
import { formatDistance, walkingMinutes } from "@/lib/geo/distance";
import { appleMusicSearchUrl, mapsUrl, priceSymbols, spotifySearchUrl } from "@/lib/guide/format";
import type { GuideItem, SectionKind } from "@/lib/guide/types";
import { cn } from "@/lib/utils";

import { SECTION_ICON, SECTION_TEXT } from "./sections";
import { WhyButton, type WhyPayload } from "./why-this";

const t = copy.guest.guide;

const SECTION_WASH: Record<SectionKind, string> = {
  eat: "bg-section-eat/10",
  drink: "bg-section-drink/10",
  do: "bg-section-do/10",
  rainy: "bg-section-rainy/10",
  host_picks: "bg-section-picks/10",
  playlist: "bg-section-media/10",
  films: "bg-section-media/10",
  shows: "bg-section-media/10",
};

/** The illustration a card shows when Qloo has no photo, or the photo fails to load. */
export function SectionArt({
  section,
  className,
  small = false,
}: {
  section: SectionKind;
  className?: string;
  small?: boolean;
}) {
  const Icon = SECTION_ICON[section];
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-tint",
        className,
      )}
    >
      <span className={cn("absolute inset-0", SECTION_WASH[section])} />
      {!small && (
        <span
          className={cn(
            "absolute -right-8 -bottom-8 size-32 rounded-full border-[14px] border-current opacity-10",
            SECTION_TEXT[section],
          )}
        />
      )}
      <Icon
        className={cn("relative", small ? "size-5" : "size-9", SECTION_TEXT[section])}
        strokeWidth={1.5}
      />
    </span>
  );
}

function Thumb({
  item,
  section,
  className,
  width,
  height,
  small,
  priority,
}: {
  item: GuideItem;
  section: SectionKind;
  className: string;
  width: number;
  height: number;
  small?: boolean;
  priority?: boolean;
}) {
  return (
    <FallbackImage
      src={item.image_url}
      alt={item.name}
      width={width}
      height={height}
      priority={priority}
      className={cn("shrink-0", className)}
      fallback={<SectionArt section={section} className={className} small={small} />}
    />
  );
}

/** "Open in Maps": an outlined pill, the card's main action. */
function MapsLink({ item, city }: { item: GuideItem; city: string }) {
  return (
    <a
      href={mapsUrl(item, city)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={fill(t.card.openInMapsFor, { name: item.name })}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold transition-colors hover:border-ink hover:bg-tint"
    >
      <MapPin className="size-4" aria-hidden />
      {t.card.openInMaps}
    </a>
  );
}

interface PlaceCardProps {
  item: GuideItem;
  section: SectionKind;
  why: WhyPayload;
  city: string;
  countryCode: string | null;
  hostName: string | null;
  ribbon?: boolean;
  /** Smaller, side by side, for the concierge chat (G6). */
  compact?: boolean;
  /** The first card on the page: its photo is the largest paint on phones. */
  priority?: boolean;
}

/** G4 place card: photo on top, then name, facts, the "why you" line and two actions. */
export function PlaceCard({
  item,
  section,
  why,
  city,
  countryCode,
  hostName,
  ribbon,
  compact,
  priority,
}: PlaceCardProps) {
  const meta = [
    item.category,
    item.distance_m !== null && formatDistance(item.distance_m),
    item.distance_m !== null && fill(t.card.walk, { minutes: walkingMinutes(item.distance_m) }),
  ].filter((part): part is string => !!part);
  const price = item.price_level !== null && (
    <span className="shrink-0 pt-px text-sm font-medium text-ink-muted">
      <span aria-hidden>{priceSymbols(item.price_level, countryCode)}</span>
      <span className="sr-only">{fill(t.card.price, { level: item.price_level })}</span>
    </span>
  );
  const ribbonPill = ribbon && (
    <p className="inline-flex w-fit items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink shadow-card">
      <Star className="size-3.5 fill-brand text-brand" aria-hidden />
      {t.card.topMatch}
    </p>
  );
  const hostNote = item.host_note && (
    <blockquote className="rounded-xl bg-tint px-3.5 py-2.5 text-sm">
      <p>“{item.host_note}”</p>
      <footer className="mt-1 text-xs font-medium text-ink-muted">
        {hostName ? fill(t.card.hostNoteBy, { host: hostName }) : t.card.hostNote}
      </footer>
    </blockquote>
  );

  if (compact) {
    return (
      <article className="relative flex flex-col gap-3 rounded-2xl border bg-surface p-3 shadow-card">
        <div className="flex gap-3">
          <Thumb
            item={item}
            section={section}
            width={80}
            height={80}
            small
            className="size-20 rounded-xl"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base leading-snug font-semibold">{item.name}</h3>
              {price}
            </div>
            <p className="text-sm text-ink-muted">{meta.join(" · ")}</p>
            {item.why_you && <p className="pt-1 text-sm leading-relaxed">{item.why_you}</p>}
          </div>
        </div>
        {hostNote}
        <div className="flex flex-wrap items-center gap-1">
          <MapsLink item={item} city={city} />
          <WhyButton payload={why} />
        </div>
      </article>
    );
  }

  return (
    <article className="lift relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-card">
      <div className="relative">
        <Thumb
          item={item}
          section={section}
          width={420}
          height={300}
          priority={priority}
          className="aspect-[7/5] w-full"
        />
        {ribbonPill && <div className="absolute top-3 left-3">{ribbonPill}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[17px] leading-snug font-semibold">{item.name}</h3>
          {price}
        </div>
        {meta.length > 0 && <p className="text-sm text-ink-muted">{meta.join(" · ")}</p>}
        {item.why_you && <p className="pt-1 text-[15px] leading-relaxed">{item.why_you}</p>}
        {hostNote && <div className="pt-2">{hostNote}</div>}
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
          <MapsLink item={item} city={city} />
          <WhyButton payload={why} />
        </div>
      </div>
    </article>
  );
}

/** G4 playlist row: artist, genre, Spotify and Apple Music searches. */
export function PlaylistRow({ item, why }: { item: GuideItem; why: WhyPayload }) {
  const link =
    "inline-flex min-h-11 items-center rounded-full px-2.5 text-sm font-semibold text-plum transition-colors hover:bg-tint";
  return (
    <li className="flex items-center gap-3 py-1.5">
      <Thumb
        item={item}
        section="playlist"
        width={56}
        height={56}
        small
        className="size-14 rounded-xl"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate pt-1">
          <span className="font-semibold">{item.name}</span>
          {item.category && (
            <span className="text-sm text-ink-muted">
              {" · "}
              {item.category}
            </span>
          )}
        </p>
        <div className="-ml-2.5 flex items-center">
          <a
            href={spotifySearchUrl(item.name)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={fill(t.playlist.spotifyFor, { name: item.name })}
            className={link}
          >
            {t.playlist.spotify}
          </a>
          <a
            href={appleMusicSearchUrl(item.name)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={fill(t.playlist.appleMusicFor, { name: item.name })}
            className={link}
          >
            {t.playlist.appleMusic}
          </a>
        </div>
      </div>
      <WhyButton payload={why} iconOnly />
    </li>
  );
}

/** G4 film or show tile, poster style, for the horizontal shelf. */
export function MediaTile({
  item,
  section,
  why,
}: {
  item: GuideItem;
  section: "films" | "shows";
  why: WhyPayload;
}) {
  const meta = [item.year, item.category].filter(Boolean).join(" · ");
  return (
    <li className="flex w-36 shrink-0 snap-start flex-col gap-2 sm:w-40">
      <Thumb
        item={item}
        section={section}
        width={160}
        height={240}
        className="lift aspect-[2/3] w-full rounded-xl shadow-card"
      />
      <div className="flex flex-col gap-0.5">
        <h4 className="line-clamp-2 text-sm leading-snug font-semibold">{item.name}</h4>
        {meta && <p className="text-xs text-ink-muted">{meta}</p>}
      </div>
      <WhyButton payload={why} className="-ml-3 self-start" />
    </li>
  );
}
