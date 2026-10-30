"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * L2 layout: the demo guides side by side on desktop, as tabs on phones. Every panel is
 * server-rendered; the tabs only choose which one shows below the `lg` breakpoint.
 */
export function DemoTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: ReadonlyArray<{ id: string; label: string; panel: ReactNode }>;
}) {
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label={label}
        className="grid grid-flow-col gap-1 rounded-full bg-tint p-1 lg:hidden"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(i)}
            className={cn(
              "min-h-11 truncate rounded-full px-3 text-sm font-semibold transition-[color,background-color,box-shadow]",
              i === active
                ? "bg-surface text-ink shadow-card dark:bg-tint-strong"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            className={cn("min-w-0", i === active ? "block" : "hidden", "lg:block")}
          >
            {tab.panel}
          </div>
        ))}
      </div>
    </div>
  );
}
