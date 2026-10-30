import { ChevronLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { createGuestGuide, updateProperty } from "@/app/host/actions";
import { GuestsTable, type GuestRow } from "@/components/host/guests-table";
import { HostPicks } from "@/components/host/host-picks";
import { NewGuideDialog } from "@/components/host/new-guide-dialog";
import { PropertyForm } from "@/components/host/property-form";
import { SelfServeCard } from "@/components/host/self-serve-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireHost } from "@/lib/auth";
import { selfServeUrl } from "@/lib/host/qr";
import { publicOrigin } from "@/lib/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Property" };

const TABS = ["guests", "spots", "settings"] as const;
const TYPE_LABELS = { apartment: "Apartment", house: "House", villa: "Villa", hotel: "Hotel" };

/** H4: the property page with Guests, Favourite spots and Settings tabs. */
export default async function PropertyPage({
  params,
  searchParams,
}: PageProps<"/host/properties/[id]">) {
  const { id } = await params;
  await requireHost(`/host/properties/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const tabParam = (await searchParams).tab;
  const tab = TABS.find((t) => t === tabParam) ?? "guests";

  const supabase = await createSupabaseServerClient();
  const [{ data: property }, { data: guides, error: guidesError }] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, type, address, city, country_code, lat, lng, description, house_notes, self_serve_token, self_serve_enabled, host_picks(id, qloo_entity_id, name, address, note, position, created_at)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("guides")
      .select(
        "id, token, guest_first_name, check_in, check_out, status, viewed_at, source, created_at, chat_messages(count)",
      )
      .eq("property_id", id)
      .eq("chat_messages.role", "user")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (!property) notFound();
  if (guidesError) throw new Error("Couldn't load your guests");

  const origin = publicOrigin(await headers());
  const picks = [...property.host_picks]
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map((p) => ({
      id: p.id,
      entityId: p.qloo_entity_id,
      name: p.name,
      address: p.address,
      note: p.note,
    }));
  const rows: GuestRow[] = guides.map((g) => ({
    id: g.id,
    token: g.token,
    firstName: g.guest_first_name,
    checkIn: g.check_in,
    checkOut: g.check_out,
    status: g.status,
    viewedAt: g.viewed_at,
    questions: (g.chat_messages as unknown as { count: number }[])[0]?.count ?? 0,
    source: g.source,
    createdAt: g.created_at,
  }));
  const isHotel = property.type === "hotel";
  const selfServe = (
    <SelfServeCard
      propertyId={property.id}
      enabled={property.self_serve_enabled}
      url={property.self_serve_token ? selfServeUrl(origin, property.self_serve_token) : null}
    />
  );

  return (
    <main className="flex w-full min-w-0 flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/host"
          className="-ml-3 flex min-h-11 w-fit items-center gap-1 rounded-full px-3 text-sm font-semibold hover:bg-tint"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Your properties
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-display">{property.name}</h1>
              <Badge variant="secondary">{TYPE_LABELS[property.type]}</Badge>
            </div>
            <p className="flex items-center gap-1.5 text-ink-muted">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {property.address}
            </p>
          </div>
          <NewGuideDialog action={createGuestGuide.bind(null, property.id)} origin={origin} />
        </div>
      </div>

      <Tabs defaultValue={tab} className="min-w-0 gap-8">
        <TabsList
          variant="line"
          aria-label="Property sections"
          className="no-scrollbar w-full justify-start overflow-x-auto"
        >
          <TabsTrigger value="guests">Guests ({rows.length})</TabsTrigger>
          <TabsTrigger value="spots">Favourite spots</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="guests" className="flex min-w-0 flex-col gap-6">
          {isHotel && selfServe}
          <GuestsTable rows={rows} origin={origin} />
        </TabsContent>

        <TabsContent value="spots" className="max-w-reading">
          <HostPicks propertyId={property.id} picks={picks} />
        </TabsContent>

        <TabsContent value="settings" className="flex max-w-reading flex-col gap-10">
          <section aria-labelledby="details-title" className="flex flex-col gap-4">
            <h2 id="details-title" className="text-heading">
              Details
            </h2>
            <PropertyForm
              action={updateProperty.bind(null, property.id)}
              submitLabel="Save changes"
              initial={{
                name: property.name,
                type: property.type,
                address: property.address,
                city: property.city,
                countryCode: property.country_code,
                lat: property.lat,
                lng: property.lng,
                description: property.description,
                houseNotes: property.house_notes,
              }}
            />
          </section>
          {(isHotel || property.self_serve_enabled) && selfServe}
        </TabsContent>
      </Tabs>
    </main>
  );
}
