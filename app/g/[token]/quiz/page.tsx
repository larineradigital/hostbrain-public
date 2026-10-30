import { notFound, redirect } from "next/navigation";

import { Quiz } from "@/components/guest/quiz";
import { createServiceClient } from "@/lib/db/server";
import { getGuideByToken, guestStage } from "@/lib/guide/guest";
import { loadPopularPicks } from "@/lib/guide/popular";
import type { QuizChips } from "@/lib/guide/quiz";

export default async function QuizPage({ params }: PageProps<"/g/[token]/quiz">) {
  const { token } = await params;
  const guide = await getGuideByToken(token);
  if (!guide) notFound();
  if (guestStage(guide) !== "welcome") redirect(`/g/${guide.token}`);

  const { data, error } = await createServiceClient()
    .from("qloo_tag_map")
    .select("label, kind, display")
    .in("kind", ["cuisine", "vibe", "dietary"])
    .order("position");
  if (error) throw new Error(`tag map load failed: ${error.message}`);
  const chips: QuizChips = { cuisine: [], vibe: [], dietary: [] };
  for (const row of data) {
    chips[row.kind as keyof QuizChips]?.push({ label: row.label, display: row.display });
  }

  // A cuisine chip that repeats a dietary toggle ("Vegetarian") would show twice on one screen.
  const dietary = new Set(chips.dietary.map((c) => c.display));
  chips.cuisine = chips.cuisine.filter((c) => !dietary.has(c.display));

  // Not awaited: popular picks stream in while the guest starts typing.
  const popular = loadPopularPicks();
  return (
    <Quiz
      token={guide.token}
      chips={chips}
      popularArtists={popular.then((p) => p.artist)}
      popularMedia={popular.then((p) => p.media)}
    />
  );
}
