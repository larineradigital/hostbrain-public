import type { Metadata } from "next";
import { Suspense } from "react";

// Self-serve links sit on printed cards in rooms: keep them out of search engines.
export const metadata: Metadata = { title: "Your guide", robots: { index: false, follow: false } };

export default function SelfServeLayout({ children }: LayoutProps<"/s/[propertyToken]">) {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-reading px-4 py-10" aria-busy="true">
            <div className="h-40 w-full animate-pulse rounded-xl bg-tint" />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
