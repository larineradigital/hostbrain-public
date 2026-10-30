"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { SECTION_ICON } from "./sections";

export interface NavItem {
  key: keyof typeof SECTION_ICON;
  /** The section's element id. */
  id: string;
  label: string;
}

/**
 * G4 sticky section nav: icon pills that scroll the page to a section. The pill of the
 * section in view is filled, and scrolled into sight inside the bar.
 */
export function SectionNav({ items, label }: { items: NavItem[]; label: string }) {
  const [active, setActive] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => !!el);
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The first section (in page order) inside the band under the bar wins.
        const first = items.find((item) => visible.has(item.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const pill = list.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    const bar = list.current;
    if (!pill || !bar) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bar.scrollTo({
      left: pill.offsetLeft - bar.clientWidth / 2 + pill.clientWidth / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <nav
      aria-label={label}
      className="sticky top-0 z-20 border-b bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/80"
    >
      <ul
        ref={list}
        className="mx-auto no-scrollbar flex max-w-guide gap-2 overflow-x-auto px-4 py-2.5 sm:px-6"
      >
        {items.map((item) => {
          const Icon = SECTION_ICON[item.key];
          const on = item.id === active;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                data-id={item.id}
                aria-current={on ? "location" : undefined}
                onClick={(event) => {
                  // A calm scroll instead of a jump (an instant one with reduced motion).
                  const target = document.getElementById(item.id);
                  if (!target) return;
                  event.preventDefault();
                  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
                  history.replaceState(null, "", `#${item.id}`);
                }}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                  on
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-surface text-ink hover:border-ink",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
