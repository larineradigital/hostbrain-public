import {
  Building,
  Building2,
  ConciergeBell,
  Home,
  MapPin,
  Plus,
  Star,
  Trees,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireHost } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your properties" };

const TYPE_ICONS = {
  apartment: Building,
  house: Home,
  villa: Trees,
  hotel: ConciergeBell,
} as const;

const TYPE_LABELS = {
  apartment: "Apartment",
  house: "House",
  villa: "Villa",
  hotel: "Hotel",
} as const;

export default async function PropertiesPage() {
  await requireHost("/host");
  const supabase = await createSupabaseServerClient();
  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, name, type, city, address, host_picks(count), guides(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your properties");

  return (
    <main className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display">Your properties</h1>
          <p className="text-lg text-ink-muted">
            Each guest gets a guide picked for their own taste.
          </p>
        </div>
        {properties.length ? (
          <Button asChild>
            <Link href="/host/properties/new">
              <Plus aria-hidden />
              Add property
            </Link>
          </Button>
        ) : null}
      </div>

      {properties.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => {
            const picks = (property.host_picks as unknown as { count: number }[])[0]?.count ?? 0;
            const guides = (property.guides as unknown as { count: number }[])[0]?.count ?? 0;
            const Icon = TYPE_ICONS[property.type];
            return (
              <li key={property.id}>
                <Link
                  href={`/host/properties/${property.id}`}
                  className="lift flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-card focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span
                    className="relative flex aspect-[5/2] items-center justify-center overflow-hidden bg-brand-soft"
                    aria-hidden
                  >
                    <span className="absolute -right-10 -bottom-14 size-44 rounded-full border-[22px] border-brand opacity-10" />
                    <span className="absolute -top-12 -left-8 size-32 rounded-full border-[16px] border-brand opacity-10" />
                    <span className="relative flex size-14 items-center justify-center rounded-2xl bg-surface shadow-card">
                      <Icon className="size-7 text-brand" strokeWidth={1.75} />
                    </span>
                  </span>
                  <span className="flex flex-1 flex-col gap-2 p-5">
                    <span className="flex items-start justify-between gap-2">
                      <h2 className="text-heading">{property.name}</h2>
                      <Badge variant="secondary">{TYPE_LABELS[property.type]}</Badge>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                      <MapPin className="size-4" aria-hidden />
                      {property.city}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <Users className="size-4" aria-hidden />
                        {guides === 1 ? "1 guest guide" : `${guides} guest guides`}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Star className="size-4" aria-hidden />
                        {picks === 1 ? "1 favourite spot" : `${picks} favourite spots`}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
          <span
            className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft"
            aria-hidden
          >
            <Building2 className="size-7 text-brand" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-heading font-semibold">Add your first property</p>
            <p className="text-ink-muted">
              Its address, house notes and your favourite spots nearby.
            </p>
          </div>
          <Button asChild>
            <Link href="/host/properties/new">
              <Plus aria-hidden />
              Add your first property
            </Link>
          </Button>
        </div>
      )}
    </main>
  );
}
