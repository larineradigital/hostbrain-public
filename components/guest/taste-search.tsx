"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { Suspense, use, useEffect, useId, useState } from "react";

import { chipToggle, chipVariants } from "@/components/ui/chip";
import { copy, fill } from "@/lib/copy";
import { MAX_QUIZ_PICKS, type QuizPick } from "@/lib/guide/quiz";
import type { SearchItem } from "@/lib/qloo/view";
import { cn } from "@/lib/utils";

type Kind = "artist" | "media";

interface TasteSearchProps {
  kind: Kind;
  /** The guest's guide token: the search route only answers for a real guide. */
  token: string;
  placeholder: string;
  selected: QuizPick[];
  onChange: (picks: QuizPick[]) => void;
  /** Shown before the guest types. */
  popular: Promise<QuizPick[]>;
}

/** G2 type-ahead: Qloo search results as chips, the guest's picks above the field. */
export function TasteSearch({
  kind,
  token,
  placeholder,
  selected,
  onChange,
  popular,
}: TasteSearchProps) {
  const t = copy.guest.quiz;
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const active = query.trim().length >= 2;
  const full = selected.length >= MAX_QUIZ_PICKS;
  const chosen = new Set(selected.map((p) => p.entityId));

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q, kind, token });
        const res = await fetch(`/api/qloo/search?${params}`, { signal: controller.signal });
        const body = (await res.json()) as { items?: SearchItem[] };
        setResults(body.items ?? []);
        setSearchedFor(q);
        setStatus(res.ok ? "idle" : "error");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind, token]);

  const toggle = (pick: QuizPick) => {
    if (chosen.has(pick.entityId)) onChange(selected.filter((p) => p.entityId !== pick.entityId));
    else if (!full) onChange([...selected, pick]);
  };

  return (
    <div className="flex flex-col gap-4">
      {selected.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={t.picked}>
          {selected.map((pick) => (
            <li key={pick.entityId} className="max-w-full">
              <button
                type="button"
                onClick={() => toggle(pick)}
                aria-label={fill(t.remove, { name: pick.name })}
                className="flex min-h-11 max-w-full items-center gap-2 rounded-full bg-ink py-1.5 pr-3.5 pl-1.5 text-sm font-semibold text-bg transition-opacity outline-none hover:opacity-85 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <ChipImage src={pick.imageUrl} />
                <span className="max-w-[14rem] truncate">{pick.name}</span>
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-ink"
          aria-hidden
        />
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <input
          id={inputId}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-14 w-full rounded-full border bg-surface pr-14 pl-13 text-base font-medium shadow-float transition-[border-color,box-shadow] outline-none placeholder:font-normal placeholder:text-ink-muted focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t.clear}
            className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-tint hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>

      {full ? <p className="text-sm text-ink-muted">{t.full}</p> : null}

      <div aria-live="polite" className="flex flex-col gap-2">
        {active ? (
          <>
            <h2 className="pt-1 text-sm font-semibold">{t.results}</h2>
            {status === "error" ? (
              <p className="text-sm text-ink-muted">{t.searchError}</p>
            ) : status === "loading" && searchedFor !== query.trim() && !results.length ? (
              <p className="text-sm text-ink-muted">{t.searching}</p>
            ) : results.length ? (
              <ChipList
                picks={results.map((r) => ({
                  entityId: r.entityId,
                  name: r.name,
                  imageUrl: r.imageUrl,
                  detail: r.detail,
                }))}
                chosen={chosen}
                full={full}
                onToggle={toggle}
              />
            ) : searchedFor ? (
              <p className="text-sm text-ink-muted">{t.noResults}</p>
            ) : null}
          </>
        ) : (
          <>
            <h2 className="pt-1 text-sm font-semibold">{t.popular}</h2>
            <Suspense fallback={<ChipSkeleton />}>
              <PopularChips popular={popular} chosen={chosen} full={full} onToggle={toggle} />
            </Suspense>
          </>
        )}
      </div>
    </div>
  );
}

interface ChipListProps {
  chosen: Set<string>;
  full: boolean;
  onToggle: (pick: QuizPick) => void;
}

function PopularChips({ popular, ...rest }: ChipListProps & { popular: Promise<QuizPick[]> }) {
  const picks = use(popular);
  if (!picks.length) return null;
  return <ChipList picks={picks} {...rest} />;
}

function ChipList({
  picks,
  chosen,
  full,
  onToggle,
}: ChipListProps & { picks: Array<QuizPick & { detail?: string }> }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {picks.map((pick) => {
        const on = chosen.has(pick.entityId);
        return (
          <li key={pick.entityId} className="max-w-full">
            <button
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() =>
                onToggle({ entityId: pick.entityId, name: pick.name, imageUrl: pick.imageUrl })
              }
              className={cn(
                chipVariants({ size: "md" }),
                chipToggle,
                "gap-2 py-1.5 pr-3.5 pl-1.5 text-left",
              )}
            >
              <ChipImage src={pick.imageUrl} />
              <span className="truncate font-semibold">{pick.name}</span>
              {pick.detail ? (
                <span className="hidden truncate opacity-70 min-[400px]:inline">{pick.detail}</span>
              ) : null}
              {on ? <Check aria-hidden /> : <Plus className="opacity-60" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ChipImage({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="size-8 shrink-0 rounded-full bg-tint" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Qloo images come from many hosts
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="size-8 shrink-0 rounded-full bg-tint object-cover"
    />
  );
}

function ChipSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {[28, 36, 24, 32, 28].map((w, i) => (
        <span
          key={i}
          className="h-11 animate-pulse rounded-full bg-tint"
          style={{ width: `${w * 4}px` }}
        />
      ))}
    </div>
  );
}
