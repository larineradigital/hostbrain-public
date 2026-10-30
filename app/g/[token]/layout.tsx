import type { Metadata } from "next";
import { Suspense } from "react";

// Token links are private: keep them out of search engines.
export const metadata: Metadata = { title: "Your guide", robots: { index: false, follow: false } };

/** Guest pages: no login, mobile-first, one column. The token is read inside the boundary. */
export default function GuestLayout({ children }: LayoutProps<"/g/[token]">) {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<GuestSkeleton />}>{children}</Suspense>
    </div>
  );
}

function GuestSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-reading flex-col gap-4 px-4 py-10"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-40 w-full animate-pulse rounded-xl bg-tint" />
      <div className="h-8 w-48 animate-pulse rounded-md bg-tint" />
      <div className="h-20 w-full animate-pulse rounded-lg bg-tint" />
    </div>
  );
}
