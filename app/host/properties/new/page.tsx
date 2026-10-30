import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { createProperty } from "@/app/host/actions";
import { PropertyForm } from "@/components/host/property-form";
import { requireHost } from "@/lib/auth";

export const metadata: Metadata = { title: "New property" };

export default async function NewPropertyPage() {
  await requireHost("/host/properties/new");
  return (
    <main className="mx-auto flex w-full max-w-reading flex-col gap-6">
      <Link
        href="/host"
        className="-ml-3 flex min-h-11 w-fit items-center gap-1 rounded-full px-3 text-sm font-semibold hover:bg-tint"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Your properties
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-display">New property</h1>
        <p className="text-lg text-ink-muted">
          Next, you&apos;ll add the spots you always recommend.
        </p>
      </div>
      <PropertyForm action={createProperty} submitLabel="Save and add favourite spots" />
    </main>
  );
}
