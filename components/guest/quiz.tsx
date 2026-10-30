"use client";

import { Check, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { saveQuiz } from "@/app/g/[token]/actions";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { copy, fill } from "@/lib/copy";
import { hasSignal, type QuizChip, type QuizChips, type QuizPick } from "@/lib/guide/quiz";

import { SkipButton } from "./skip-button";
import { TasteSearch } from "./taste-search";

const STEPS = ["music", "media", "food"] as const;

interface QuizProps {
  token: string;
  chips: QuizChips;
  /** Shown before the guest types; streamed from the server. */
  popularArtists: Promise<QuizPick[]>;
  popularMedia: Promise<QuizPick[]>;
}

/** G2: three quick steps, progress dots, Back and Next pinned at the bottom. */
export function Quiz({ token, chips, popularArtists, popularMedia }: QuizProps) {
  const t = copy.guest.quiz;
  const [step, setStep] = useState(0);
  const [artists, setArtists] = useState<QuizPick[]>([]);
  const [media, setMedia] = useState<QuizPick[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const key = STEPS[step];
  const last = step === STEPS.length - 1;
  const input = { artists, media, tags, dietary };
  const ready = hasSignal(input);

  useEffect(() => {
    // Move focus to the new step's title, but not on first load.
    if (moved.current) heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const go = (next: number) => {
    moved.current = true;
    setStep(next);
  };

  const finish = () =>
    start(async () => {
      const result = await saveQuiz(token, input);
      if (result && !result.ok) toast.error(result.error);
    });

  return (
    <main className="mx-auto flex w-full max-w-reading flex-1 flex-col px-4 pt-3 pb-36 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <ol
          className="flex max-w-40 flex-1 items-center gap-1.5"
          aria-label={fill(t.stepOf, { step: step + 1 })}
        >
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-brand" : "bg-line"
              }`}
            />
          ))}
        </ol>
        <SkipButton token={token} className="-mr-2 px-2" />
      </div>

      <div className="flex flex-col gap-2 pt-5 pb-6">
        <p className="text-sm font-semibold text-ink-muted">{fill(t.stepOf, { step: step + 1 })}</p>
        <h1 ref={heading} tabIndex={-1} className="text-display outline-none">
          {t[key].title}
        </h1>
        <p className="text-lg text-ink-muted">{t[key].hint}</p>
      </div>

      {key === "music" ? (
        <TasteSearch
          key="artist"
          kind="artist"
          token={token}
          placeholder={t.music.placeholder}
          selected={artists}
          onChange={setArtists}
          popular={popularArtists}
        />
      ) : key === "media" ? (
        <TasteSearch
          key="media"
          kind="media"
          token={token}
          placeholder={t.media.placeholder}
          selected={media}
          onChange={setMedia}
          popular={popularMedia}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <ChipGroup title={t.food.cuisine} chips={chips.cuisine} value={tags} onChange={setTags} />
          <ChipGroup title={t.food.vibe} chips={chips.vibe} value={tags} onChange={setTags} />
          <ChipGroup
            title={t.food.dietary}
            chips={chips.dietary}
            value={dietary}
            onChange={setDietary}
          />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-reading flex-col gap-2 px-4 py-3 sm:px-6">
          {last && !ready ? (
            <p className="text-center text-sm text-ink-muted" role="status">
              {t.needOne}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            {step === 0 ? (
              <Button asChild variant="outline" size="lg" className="flex-1">
                <Link href={`/g/${token}`}>
                  <ChevronLeft aria-hidden />
                  {t.back}
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => go(step - 1)}
              >
                <ChevronLeft aria-hidden />
                {t.back}
              </Button>
            )}
            {last ? (
              <Button
                type="button"
                size="lg"
                className="flex-[2]"
                disabled={!ready || pending}
                onClick={finish}
              >
                {t.finish}
              </Button>
            ) : (
              <Button type="button" size="lg" className="flex-[2]" onClick={() => go(step + 1)}>
                {t.next}
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function ChipGroup({
  title,
  chips,
  value,
  onChange,
}: {
  title: string;
  chips: QuizChip[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  if (!chips.length) return null;
  return (
    <fieldset className="flex flex-col">
      <legend className="pb-3 text-base font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const on = value.includes(chip.label);
          return (
            <ChipButton
              key={chip.label}
              aria-pressed={on}
              onClick={() =>
                onChange(on ? value.filter((l) => l !== chip.label) : [...value, chip.label])
              }
            >
              {on && <Check aria-hidden />}
              {chip.display}
            </ChipButton>
          );
        })}
      </div>
    </fieldset>
  );
}
