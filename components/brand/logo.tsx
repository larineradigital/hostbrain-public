import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/** Host Brain's mark: a map pin in a terracotta tile. Our own, not anyone else's. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-brand" />
      <path
        d="M16 7.25a6.75 6.75 0 0 0-6.75 6.75c0 4.77 5.4 9.97 6.13 10.6a.95.95 0 0 0 1.24 0c.73-.63 6.13-5.83 6.13-10.6A6.75 6.75 0 0 0 16 7.25Z"
        className="fill-accent-ink"
      />
      <circle cx="16" cy="14" r="2.5" className="fill-brand" />
    </svg>
  );
}

/** Mark plus the "Host Brain" wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-lg font-bold tracking-tight", className)}
    >
      <LogoMark />
      {copy.common.appName}
    </span>
  );
}
