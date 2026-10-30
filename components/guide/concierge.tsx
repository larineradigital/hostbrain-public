"use client";

import { ArrowUp, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { LogoMark } from "@/components/brand/logo";
import { ChipButton } from "@/components/ui/chip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CHAT_LIMITS, type ChatCard, type ChatEvent, type ChatMessageView } from "@/lib/ai/chat";
import { copy, fill } from "@/lib/copy";
import { parseSse } from "@/lib/guide/sse";
import { PLACE_SECTIONS, type SectionKind } from "@/lib/guide/types";
import { whyPayloadFor } from "@/lib/guide/why";
import { cn } from "@/lib/utils";

import { MediaTile, PlaceCard, PlaylistRow } from "./cards";

const t = copy.guest.concierge;

interface ConciergeProps {
  guideId: string;
  token: string;
  city: string;
  countryCode: string | null;
  hostName: string | null;
  /** Earlier messages in this guide's chat, oldest first. */
  initialMessages: ChatMessageView[];
}

const PLACE_KINDS = new Set<SectionKind>([...PLACE_SECTIONS, "host_picks"]);
type CardGroup = { kind: "places" | "artists" | "titles"; cards: ChatCard[] };

/** Consecutive cards of one kind share a list: places stack, artists list, titles scroll. */
function groupCards(cards: ChatCard[]): CardGroup[] {
  const groups: CardGroup[] = [];
  for (const card of cards) {
    const kind = PLACE_KINDS.has(card.section)
      ? "places"
      : card.section === "playlist"
        ? "artists"
        : "titles";
    const last = groups.at(-1);
    if (last?.kind === kind) last.cards.push(card);
    else groups.push({ kind, cards: [card] });
  }
  return groups;
}

const why = (card: ChatCard) => whyPayloadFor(card.item, card);

function Cards({
  cards,
  city,
  countryCode,
  hostName,
}: { cards: ChatCard[] } & Pick<ConciergeProps, "city" | "countryCode" | "hostName">) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={t.picks}>
      {groupCards(cards).map((group) => {
        const key = group.cards[0].item.entity_id;
        if (group.kind === "places") {
          return (
            <ul key={key} className="flex flex-col gap-2">
              {group.cards.map((card) => (
                <li key={card.item.entity_id}>
                  <PlaceCard
                    compact
                    item={card.item}
                    section={card.section}
                    why={why(card)}
                    city={city}
                    countryCode={countryCode}
                    hostName={hostName}
                  />
                </li>
              ))}
            </ul>
          );
        }
        if (group.kind === "artists") {
          return (
            <ul key={key} className="flex flex-col divide-y rounded-2xl border bg-surface px-3">
              {group.cards.map((card) => (
                <PlaylistRow key={card.item.entity_id} item={card.item} why={why(card)} />
              ))}
            </ul>
          );
        }
        return (
          <ul key={key} className="relative flex snap-x gap-3 overflow-x-auto pb-2">
            {group.cards.map((card) => (
              <MediaTile
                key={card.item.entity_id}
                item={card.item}
                section={card.section === "shows" ? "shows" : "films"}
                why={why(card)}
              />
            ))}
          </ul>
        );
      })}
    </div>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <span className="inline-flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

/** G6: the concierge, a bottom sheet (90 % height) opened from a floating button. */
export function Concierge(props: ConciergeProps) {
  const { guideId, token } = props;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageView[]>(props.initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "end" });
  }, [messages, open, working]);

  const updateReply = (id: string, change: (message: ChatMessageView) => ChatMessageView) =>
    setMessages((list) => list.map((m) => (m.id === id ? change(m) : m)));

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || pending) return;
    if (message.length > CHAT_LIMITS.maxChars) {
      setError(fill(t.errors.tooLong, { max: CHAT_LIMITS.maxChars }));
      return;
    }
    const stamp = Date.now();
    const replyId = `reply-${stamp}`;
    setError(null);
    setInput("");
    setPending(true);
    setWorking(t.typing);
    setMessages((list) => [
      ...list,
      { id: `you-${stamp}`, role: "user", text: message, cards: [] },
      { id: replyId, role: "assistant", text: "", cards: [] },
    ]);

    const controller = new AbortController();
    abort.current = controller;
    let failed: string | null = null;
    try {
      const response = await fetch(`/api/guides/${guideId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        failed = response.status === 429 ? t.errors.rateLimit : t.errors.generic;
      } else {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const { events, rest } = parseSse<ChatEvent>(buffer + value);
          buffer = rest;
          for (const event of events) {
            if (event.type === "text") {
              updateReply(replyId, (m) => ({ ...m, text: m.text + event.delta }));
            } else if (event.type === "replace") {
              updateReply(replyId, (m) => ({ ...m, text: event.text }));
            } else if (event.type === "cards") {
              updateReply(replyId, (m) => ({ ...m, cards: [...m.cards, ...event.cards] }));
            } else if (event.type === "status") {
              setWorking(t.working[event.tool]);
            } else if (event.type === "error") {
              failed = event.message;
            }
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) failed = t.errors.generic;
    }
    setPending(false);
    setWorking(null);
    if (failed) {
      setError(failed);
      // An empty reply bubble is dropped; a partial one stays.
      setMessages((list) =>
        list.filter((m) => m.id !== replyId || m.text.trim() || m.cards.length),
      );
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-5 font-semibold text-accent-ink shadow-float transition-[background-color,transform] hover:bg-brand-hover active:scale-[0.98] sm:right-6 sm:bottom-6"
      >
        <MessageCircle className="size-5" aria-hidden />
        {t.open}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto flex h-[90dvh] w-full max-w-reading flex-col gap-0 p-0 pt-2 sm:border-x"
        >
          <SheetHeader className="flex-row items-center gap-3 border-b pt-2 pr-14">
            <LogoMark className="size-10" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <SheetTitle>{t.title}</SheetTitle>
              <SheetDescription>{t.intro}</SheetDescription>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            <ol className="flex flex-col gap-4" aria-label={t.title}>
              <li className="max-w-[85%] self-start rounded-3xl rounded-bl-md bg-tint px-4 py-3">
                {t.greeting}
              </li>
              {messages.map((message) =>
                message.role === "user" ? (
                  <li
                    key={message.id}
                    className="max-w-[85%] self-end rounded-3xl rounded-br-md bg-brand px-4 py-3 whitespace-pre-line text-accent-ink"
                  >
                    <span className="sr-only">{t.you}: </span>
                    {message.text}
                  </li>
                ) : (
                  <li key={message.id} className="flex w-full flex-col gap-2 self-start">
                    <span className="sr-only">{t.concierge}:</span>
                    {message.text && (
                      <p className="max-w-[85%] self-start rounded-3xl rounded-bl-md bg-tint px-4 py-3 whitespace-pre-line">
                        {message.text}
                      </p>
                    )}
                    {message.cards.length > 0 && (
                      <Cards
                        cards={message.cards}
                        city={props.city}
                        countryCode={props.countryCode}
                        hostName={props.hostName}
                      />
                    )}
                  </li>
                ),
              )}
            </ol>

            {messages.length === 0 && (
              <section className="mt-5 flex flex-col gap-3" aria-labelledby="concierge-suggested">
                <h3 id="concierge-suggested" className="text-sm font-semibold">
                  {t.suggestedLabel}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {t.suggested.map((prompt) => (
                    <li key={prompt}>
                      <ChipButton onClick={() => void send(prompt)}>{prompt}</ChipButton>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div role="status" aria-live="polite" className="mt-3 min-h-6">
              {pending && working && <Typing label={working} />}
            </div>
            {error && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {error}
              </p>
            )}
            <div ref={end} />
          </div>

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-2 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5"
          >
            <div className="flex items-end gap-2 rounded-3xl border border-line-strong bg-surface p-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-ink focus-within:ring-[3px] focus-within:ring-ring/30">
              <label htmlFor="concierge-input" className="sr-only">
                {t.inputLabel}
              </label>
              <textarea
                id="concierge-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                maxLength={CHAT_LIMITS.maxChars}
                rows={1}
                placeholder={t.placeholder}
                aria-describedby="concierge-count concierge-disclaimer"
                className="[field-sizing:content] max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base outline-none placeholder:text-ink-muted"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                aria-label={t.send}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-accent-ink transition-[background-color,opacity] hover:bg-brand-hover disabled:bg-tint-strong disabled:text-ink-muted"
              >
                <ArrowUp className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex items-start justify-between gap-3 text-xs text-ink-muted">
              <p id="concierge-disclaimer">{t.disclaimer}</p>
              <p
                id="concierge-count"
                className={cn(
                  "shrink-0 tabular-nums",
                  input.length >= CHAT_LIMITS.maxChars && "text-destructive",
                )}
              >
                {fill(t.counter, { count: input.length, max: CHAT_LIMITS.maxChars })}
              </p>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
