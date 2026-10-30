"use client";

import {
  ArrowRight,
  Check,
  Circle,
  CircleAlert,
  LoaderCircle,
  RotateCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { guideStatus } from "@/app/g/[token]/actions";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { copy, fill } from "@/lib/copy";
import { applyEvent, initialProgress, type Progress } from "@/lib/guide/progress";
import { parseSse } from "@/lib/guide/sse";
import type { GenerationEvent } from "@/lib/guide/types";
import { cn } from "@/lib/utils";

const POLL_MS = 2000;
/** Long enough to see the last tick before the guide opens. */
const OPEN_DELAY_MS = 1200;

type Action = { type: "reset" } | { type: "waiting" } | GenerationEvent;

interface BuildingProps {
  guideId: string;
  token: string;
  street: string;
}

/** G3: streams generation progress and ticks off each step, then opens the guide. */
export function Building({ guideId, token, street }: BuildingProps) {
  const t = copy.guest.building;
  const router = useRouter();
  const [state, dispatch] = useReducer(
    (current: Progress, action: Action) =>
      action.type === "reset"
        ? initialProgress(street)
        : action.type === "waiting"
          ? { ...current, waiting: true }
          : applyEvent(current, action),
    street,
    initialProgress,
  );
  const started = useRef(false);

  /** Another tab or an earlier visit is already building: wait for its result. */
  const poll = useCallback(async () => {
    dispatch({ type: "waiting" });
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const status = await guideStatus(token).catch(() => "generating" as const);
      if (status === "ready") return dispatch({ type: "done", guideId, token });
      if (status !== "generating") return dispatch({ type: "error", message: "failed" });
    }
  }, [guideId, token]);

  const run = useCallback(async () => {
    dispatch({ type: "reset" });
    let res: Response;
    try {
      res = await fetch(`/api/guides/${guideId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      return dispatch({ type: "error", message: "network" });
    }
    if (res.status === 409) return poll();
    if (!res.ok || !res.body) return dispatch({ type: "error", message: String(res.status) });

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let finished = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const parsed = parseSse(buffer + value);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.type !== "step") finished = true;
          dispatch(event);
        }
      }
    } catch {
      // The connection dropped; generation carries on server-side.
    }
    if (!finished) await poll();
  }, [guideId, token, poll]);

  useEffect(() => {
    // Once per mount, even when Strict Mode runs effects twice: the POST starts the run.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  useEffect(() => {
    if (state.phase !== "done") return;
    const timer = setTimeout(() => router.replace(`/g/${token}`), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.phase, router, token]);

  const done = state.rows.filter((row) => row.status === "done").length;
  const total = state.rows.length + 1;
  const progress = state.phase === "done" ? 1 : done / total;

  return (
    <main className="mx-auto flex w-full max-w-reading flex-1 flex-col gap-8 px-4 pt-5 pb-10 sm:px-6">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LogoMark className="size-6" />
        {copy.common.appName}
      </p>

      <div className="flex flex-col gap-3 pt-4">
        <span
          className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand"
          aria-hidden
        >
          {state.phase === "done" ? (
            <Check className="size-7" />
          ) : (
            <Sparkles className="size-7 motion-safe:animate-pulse" />
          )}
        </span>
        <h1 className="text-display">{t.title}</h1>
        <p className="text-lg text-ink-muted">{fill(t.subtitle, { street })}</p>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-tint" aria-hidden>
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
        />
      </div>

      <ol
        className="flex flex-col rounded-2xl border bg-surface p-2 shadow-card"
        aria-label="Progress"
        aria-live="polite"
      >
        {state.rows.map((row, i) => (
          <StepRow key={row.step} label={row.label} status={row.status} index={i} />
        ))}
        <StepRow
          label={t.done}
          status={state.phase === "done" ? "done" : "pending"}
          index={state.rows.length}
        />
      </ol>

      {state.waiting && state.phase === "running" ? (
        <p className="text-sm text-ink-muted" role="status">
          {t.elsewhere}
        </p>
      ) : null}

      {state.phase === "failed" ? (
        <div
          className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/40 bg-surface p-5"
          role="alert"
        >
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert className="size-5 text-destructive" aria-hidden />
            {t.failed}
          </p>
          <Button type="button" onClick={() => void run()}>
            <RotateCw aria-hidden />
            {t.retry}
          </Button>
        </div>
      ) : null}

      {state.phase === "done" ? (
        <Button asChild size="lg" className="self-stretch sm:self-start">
          <Link href={`/g/${token}`}>
            {t.openGuide}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      ) : null}

      <p className="mt-auto text-center text-xs text-ink-muted sm:text-left">
        {copy.common.pickedWithQloo}
      </p>
    </main>
  );
}

function StepRow({
  label,
  status,
  index,
}: {
  label: string;
  status: "pending" | "active" | "done";
  index: number;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1",
        status === "pending" ? "text-ink-muted" : "text-ink",
        status === "active" && "bg-tint font-semibold",
      )}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      data-status={status}
    >
      {status === "done" ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-accent-ink">
          <Check className="size-4" aria-hidden />
        </span>
      ) : status === "active" ? (
        <LoaderCircle className="size-6 shrink-0 animate-spin text-brand" aria-hidden />
      ) : (
        <Circle className="size-6 shrink-0 text-line-strong" aria-hidden />
      )}
      <span>{label}</span>
      <span className="sr-only">
        {status === "done" ? "(done)" : status === "active" ? "(in progress)" : ""}
      </span>
    </li>
  );
}
