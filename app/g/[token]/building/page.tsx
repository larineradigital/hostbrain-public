import { notFound, redirect } from "next/navigation";

import { Building } from "@/components/guest/building";
import { getGuideByToken, guestStage } from "@/lib/guide/guest";

export default async function BuildingPage({ params }: PageProps<"/g/[token]/building">) {
  const { token } = await params;
  const guide = await getGuideByToken(token);
  if (!guide) notFound();
  if (guestStage(guide) === "welcome") redirect(`/g/${guide.token}/quiz`);

  // Same street the pipeline names in its step labels.
  const street = guide.property.address.split(",")[0]?.trim().slice(0, 40) || guide.property.city;
  return <Building guideId={guide.id} token={guide.token} street={street} />;
}
