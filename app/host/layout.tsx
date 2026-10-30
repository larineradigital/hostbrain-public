import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getHost } from "@/lib/auth";

export default function HostLayout({ children }: LayoutProps<"/host">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/80 print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-dashboard items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/host"
            aria-label="Host Brain"
            className="-ml-1 rounded-xl px-1 py-1.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Logo />
          </Link>
          <Suspense>
            <AccountMenu />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-dashboard flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0">
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </div>
    </div>
  );
}

async function AccountMenu() {
  const host = await getHost();
  if (!host) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-ink-muted sm:inline" data-testid="host-email">
        {host.email}
      </span>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-56 animate-pulse rounded-xl bg-tint" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-tint" />
    </div>
  );
}
