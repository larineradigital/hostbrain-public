"use server";

import { redirect } from "next/navigation";

import { createServiceClient } from "@/lib/db/server";
import { displayName } from "@/lib/guide/format";
import { getGuideByToken } from "@/lib/guide/guest";
import { hasSignal, quizInputSchema, type QuizInput } from "@/lib/guide/quiz";

export type QuizActionResult = { ok: false; error: string };

type QuizRow = {
  artist_ids: string[];
  artist_names: string[];
  media_ids: string[];
  media_names: string[];
  tag_urns: string[];
  tag_labels: string[];
  dietary: string[];
  skipped: boolean;
};

const SKIPPED: QuizRow = {
  artist_ids: [],
  artist_names: [],
  media_ids: [],
  media_names: [],
  tag_urns: [],
  tag_labels: [],
  dietary: [],
  skipped: true,
};

/** Checks the token and that the quiz is still open, then stores the answers. */
async function store(token: string, row: QuizRow): Promise<QuizActionResult | void> {
  const guide = await getGuideByToken(token);
  if (!guide) return { ok: false, error: "We couldn't find this guide." };
  // Once a guide is building or built, its answers are settled.
  if (guide.status === "generating" || guide.status === "ready") redirect(`/g/${guide.token}`);

  const db = createServiceClient();
  const { error } = await db
    .from("quiz_answers")
    .upsert({ guide_id: guide.id, ...row, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "We couldn't save your answers. Please try again." };
  redirect(`/g/${guide.token}/building`);
}

const uniqueById = <T extends { entityId: string }>(picks: T[]) =>
  picks.filter((p, i) => picks.findIndex((o) => o.entityId === p.entityId) === i);

/** Saves the guest's quiz (token-checked). Chip labels must be in `qloo_tag_map`. */
export async function saveQuiz(token: string, input: QuizInput): Promise<QuizActionResult | void> {
  const parsed = quizInputSchema.safeParse(input);
  if (!parsed.success || !hasSignal(parsed.data)) {
    return { ok: false, error: "Pick at least one thing you love, or let us surprise you." };
  }
  const { tags, dietary } = parsed.data;
  const artists = uniqueById(parsed.data.artists);
  const media = uniqueById(parsed.data.media);

  const labels = [...new Set([...tags, ...dietary])];
  const db = createServiceClient();
  const { data: known, error } = labels.length
    ? await db.from("qloo_tag_map").select("label, kind, urns").in("label", labels)
    : { data: [], error: null };
  if (error) return { ok: false, error: "We couldn't save your answers. Please try again." };
  const kindOf = new Map(known.map((row) => [row.label, row]));
  const tagRows = [...new Set(tags)].flatMap((label) => {
    const row = kindOf.get(label);
    return row && (row.kind === "cuisine" || row.kind === "vibe") ? [row] : [];
  });
  const dietaryLabels = [...new Set(dietary)].filter((l) => kindOf.get(l)?.kind === "dietary");

  return store(token, {
    artist_ids: artists.map((a) => a.entityId),
    artist_names: artists.map((a) => displayName(a.name)),
    media_ids: media.map((m) => m.entityId),
    media_names: media.map((m) => displayName(m.name)),
    tag_urns: [...new Set(tagRows.flatMap((row) => row.urns))].slice(0, 30),
    tag_labels: tagRows.map((row) => row.label),
    dietary: dietaryLabels,
    skipped: false,
  });
}

/** "Skip, surprise me": the guide uses party type and age band only. */
export async function skipQuiz(token: string): Promise<QuizActionResult | void> {
  return store(token, SKIPPED);
}

/** Lets the building screen wait for a run started elsewhere (another tab, a reload). */
export async function guideStatus(token: string) {
  const guide = await getGuideByToken(token);
  return guide ? guide.status : null;
}
