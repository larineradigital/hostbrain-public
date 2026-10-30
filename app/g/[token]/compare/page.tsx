import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Compare } from "@/components/guide/compare";
import { copy } from "@/lib/copy";
import { loadComparison, VERIFY_RADIUS_M } from "@/lib/guide/compare";
import { getGuideByToken, guestStage } from "@/lib/guide/guest";
import { loadGuideView } from "@/lib/guide/view";

export const metadata: Metadata = {
  title: copy.guest.compare.title,
  robots: { index: false, follow: false },
};

/** `/g/[token]/compare` (G7): AI alone vs. with Qloo for this guide's Eat section. */
export default async function ComparePage({ params }: PageProps<"/g/[token]/compare">) {
  const { token } = await params;
  const guide = await getGuideByToken(token);
  if (!guide) notFound();
  if (guestStage(guide) !== "guide") redirect(`/g/${guide.token}`);

  const view = await loadGuideView(guide.id);
  if (!view) notFound();
  const eat = view.sections.find((s) => s.section === "eat");
  // Not awaited: the Qloo column renders while the model and the Qloo checks run.
  const comparison = eat ? loadComparison(guide.id, eat.items) : null;
  return <Compare guide={guide} view={view} comparison={comparison} radiusM={VERIFY_RADIUS_M} />;
}
