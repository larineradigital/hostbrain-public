"use client";

import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AddressChoice {
  address: string;
  city: string;
  countryCode?: string;
  lat: number;
  lng: number;
}

interface Suggestion extends AddressChoice {
  id: string;
  label: string;
  detail: string;
}

interface Props {
  id: string;
  defaultValue?: string;
  invalid?: boolean;
  onSelect: (choice: AddressChoice) => void;
  /** The text no longer matches a chosen address. */
  onEdit: () => void;
}

/** Combobox over /api/geo/autocomplete (Photon, server-side). Debounced, min 3 characters. */
export function AddressAutocomplete({ id, defaultValue = "", invalid, onSelect, onEdit }: Props) {
  const listId = useId();
  const [text, setText] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const skipNext = useRef(true);
  // Suggestions for text that's since become too short are hidden, not reset in the effect.
  const shown = text.trim().length >= 3 ? items : [];

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = text.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/geo/autocomplete?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { items?: Suggestion[] };
        setItems(body.items ?? []);
        setOpen(true);
        setActive(-1);
        setStatus(res.ok ? "idle" : "error");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  function choose(item: Suggestion) {
    skipNext.current = true;
    setText(item.address);
    setOpen(false);
    setItems([]);
    onSelect(item);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder="Start typing the street and number"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onEdit();
        }}
        onFocus={() => shown.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!open || !shown.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => (i + 1) % shown.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            choose(shown[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {status === "error" ? (
        <p className="mt-1 text-sm text-ink-muted">
          Address search is unavailable right now. Try again shortly.
        </p>
      ) : null}
      {open && shown.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border bg-popover p-1.5 shadow-float"
        >
          {shown.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 text-sm",
                index === active ? "bg-tint" : "hover:bg-tint",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="flex flex-col">
                <span className="font-medium">{item.label}</span>
                <span className="text-ink-muted">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
