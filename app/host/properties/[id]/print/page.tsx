import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PrintCard } from "@/components/host/print-card";
import { requireHost } from "@/lib/auth";
import { qrSvg, selfServeUrl } from "@/lib/host/qr";
import { publicOrigin } from "@/lib/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Self-serve card" };

/** `/host/properties/[id]/print` (H5): the hotel's self-serve QR card for rooms and the lobby. */
export default async function SelfServePrintPage({
  params,
}: PageProps<"/host/properties/[id]/print">) {
  const { id } = await params;
  await requireHost(`/host/properties/${id}/print`);
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, name, city, self_serve_token, self_serve_enabled")
    .eq("id", id)
    .maybeSingle();
  if (!property?.self_serve_enabled || !property.self_serve_token) notFound();

  const svg = await qrSvg(selfServeUrl(publicOrigin(await headers()), property.self_serve_token));
  return (
    <PrintCard
      qrSvg={svg}
      city={property.city}
      propertyName={property.name}
      backHref={`/host/properties/${property.id}`}
      backLabel={property.name}
    />
  );
}
