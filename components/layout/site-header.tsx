import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { copy } from "@/lib/copy";

/** The public pages' top bar: our logo home, page actions on the right. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/80">
      <div className="mx-auto flex h-16 w-full max-w-dashboard items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={copy.common.appName}
          className="-ml-1 rounded-xl px-1 py-1.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-1">{children}</div>
      </div>
    </header>
  );
}
