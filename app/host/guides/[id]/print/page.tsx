import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PrintCard } from "@/components/host/print-card";
import { requireHost } from "@/lib/auth";
import { guideUrl, qrSvg } from "@/lib/host/qr";
import { publicOrigin } from "@/lib/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Print card" };

/** `/host/guides/[id]/print` (H5): the A6 card with the guest's QR code. */
export default async function GuidePrintPage({ params }: PageProps<"/host/guides/[id]/print">) {
  const { id } = await params;
  await requireHost(`/host/guides/${id}/print`);
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: guide } = await supabase
    .from("guides")
    .select("token, guest_first_name, properties (id, name, city)")
    .eq("id", id)
    .maybeSingle();
  if (!guide?.properties) notFound();

  const svg = await qrSvg(guideUrl(publicOrigin(await headers()), guide.token));
  return (
    <PrintCard
      qrSvg={svg}
      city={guide.properties.city}
      propertyName={guide.properties.name}
      forName={guide.guest_first_name}
      backHref={`/host/properties/${guide.properties.id}`}
      backLabel={guide.properties.name}
    />
  );
}
