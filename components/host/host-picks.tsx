"use client";

import { ArrowDown, ArrowUp, Plus, Search, Star, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addHostPick,
  moveHostPick,
  removeHostPick,
  updateHostPickNote,
  type ActionResult,
} from "@/app/host/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDistance } from "@/lib/geo/distance";
import { MAX_HOST_PICKS } from "@/lib/host/schemas";
import type { SearchItem } from "@/lib/qloo/view";

export interface HostPick {
  id: string;
  entityId: string;
  name: string;
  address: string | null;
  note: string | null;
}

export function HostPicks({ propertyId, picks }: { propertyId: string; picks: HostPick[] }) {
  const full = picks.length >= MAX_HOST_PICKS;
  return (
    <section aria-labelledby="picks-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="picks-title" className="text-heading">
          Your favourite spots
        </h2>
        <p className="text-ink-muted">
          Add up to {MAX_HOST_PICKS} places you love nearby. Each guest sees them ranked for their
          own taste.
        </p>
      </div>
      {full ? (
        <p className="text-sm text-ink-muted">
          You&apos;ve added {MAX_HOST_PICKS} spots. Remove one to add another.
        </p>
      ) : (
        <PickSearch propertyId={propertyId} existing={picks} />
      )}
      {picks.length ? (
        <ol className="flex flex-col gap-3" aria-label="Favourite spots">
          {picks.map((pick, index) => (
            <PickRow
              key={pick.id}
              pick={pick}
              first={index === 0}
              last={index === picks.length - 1}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
          No favourite spots yet. Search for a café, a bar or a view you always recommend.
        </p>
      )}
    </section>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, success?: string) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else if (success) toast.success(success);
    });
  return { pending, run };
}

function PickSearch({ propertyId, existing }: { propertyId: string; existing: HostPick[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [chosen, setChosen] = useState<SearchItem | null>(null);
  const [note, setNote] = useState("");
  const { pending, run } = useAction();
  const existingIds = new Set(existing.map((p) => p.entityId));
  // Results for a query that's been cleared since are hidden rather than reset in the effect.
  const active = query.trim().length >= 2;
  const shown = active ? results : [];

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q, kind: "place", propertyId });
        const res = await fetch(`/api/qloo/search?${params}`, { signal: controller.signal });
        const body = (await res.json()) as { items?: SearchItem[] };
        setResults(body.items ?? []);
        setSearchedFor(q);
        setStatus(res.ok ? "idle" : "error");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, propertyId]);

  function add() {
    if (!chosen) return;
    run(async () => {
      const result = await addHostPick({
        propertyId,
        entityId: chosen.entityId,
        query: searchedFor,
        note,
      });
      if (result.ok) {
        setChosen(null);
        setNote("");
        setQuery("");
      }
      return result;
    }, `${chosen.name} added`);
  }

  if (chosen) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
        <div>
          <p className="font-semibold">{chosen.name}</p>
          {chosen.address ? <p className="text-sm text-ink-muted">{chosen.address}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pick-note">Your note (optional)</Label>
          <Textarea
            id="pick-note"
            maxLength={280}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ask for Rui, best pastéis in town."
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={add} disabled={pending}>
            <Plus aria-hidden />
            {pending ? "Adding…" : "Add to my spots"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setChosen(null)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="pick-search">Search places near your property</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink"
          aria-hidden
        />
        <Input
          id="pick-search"
          type="search"
          autoComplete="off"
          placeholder="Café Lua, Tasca do Chico…"
          className="h-13 rounded-full pl-12 shadow-float"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="text-xs text-ink-muted" aria-live="polite">
        {status === "loading"
          ? "Searching…"
          : status === "error"
            ? "Search is unavailable right now."
            : active && searchedFor && !results.length
              ? "No places found nearby. Try another spelling."
              : "Places come from Qloo, so guests get real, mappable spots."}
      </p>
      {results.length ? (
        <ul
          className="flex flex-col divide-y rounded-2xl border bg-card shadow-card"
          aria-label="Search results"
        >
          {shown.map((item) => {
            const added = existingIds.has(item.entityId);
            return (
              <li key={item.entityId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="truncate text-sm text-ink-muted">
                    {[
                      item.address,
                      item.distanceM !== undefined ? formatDistance(item.distanceM) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={added}
                  onClick={() => setChosen(item)}
                  aria-label={added ? `${item.name} is already added` : `Choose ${item.name}`}
                >
                  {added ? "Added" : "Choose"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function PickRow({ pick, first, last }: { pick: HostPick; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(pick.note ?? "");
  const { pending, run } = useAction();

  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft"
          aria-hidden
        >
          <Star className="size-4 fill-brand text-brand" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{pick.name}</p>
          {pick.address ? <p className="text-sm text-ink-muted">{pick.address}</p> : null}
          {!editing && pick.note ? (
            <p className="mt-2 rounded-xl bg-tint px-3 py-2 text-sm">“{pick.note}”</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={first || pending}
            onClick={() => run(() => moveHostPick(pick.id, "up"))}
            aria-label={`Move ${pick.name} up`}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={last || pending}
            onClick={() => run(() => moveHostPick(pick.id, "down"))}
            aria-label={`Move ${pick.name} down`}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => removeHostPick(pick.id), `${pick.name} removed`)}
            aria-label={`Remove ${pick.name}`}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`note-${pick.id}`}>Your note</Label>
          <Textarea
            id={`note-${pick.id}`}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await updateHostPickNote(pick.id, note);
                  if (result.ok) setEditing(false);
                  return result;
                }, "Note saved")
              }
            >
              Save note
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="w-fit px-0"
          onClick={() => setEditing(true)}
        >
          {pick.note ? "Edit note" : "Add a note"}
        </Button>
      )}
    </li>
  );
}
