import { z } from "zod";

/** Guest quiz shapes, shared by the quiz screen and its server action (no server imports). */

export const MAX_QUIZ_PICKS = 5;

/** A Qloo entity the guest picked from type-ahead: its ID and the name shown on the chip. */
export const quizPickSchema = z.object({
  entityId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().optional(),
});
export type QuizPick = z.infer<typeof quizPickSchema>;

export const quizInputSchema = z.object({
  artists: z.array(quizPickSchema).max(MAX_QUIZ_PICKS),
  media: z.array(quizPickSchema).max(MAX_QUIZ_PICKS),
  /** Cuisine and vibe chip labels (`qloo_tag_map.label`). */
  tags: z.array(z.string().max(40)).max(20),
  /** Dietary toggle labels. */
  dietary: z.array(z.string().max(40)).max(4),
});
export type QuizInput = z.infer<typeof quizInputSchema>;

/** A cuisine, vibe or dietary chip from `qloo_tag_map`. */
export interface QuizChip {
  label: string;
  display: string;
}

export interface QuizChips {
  cuisine: QuizChip[];
  vibe: QuizChip[];
  dietary: QuizChip[];
}

export interface PopularPicks {
  artist: QuizPick[];
  media: QuizPick[];
}

/** The quiz needs at least one signal; otherwise the guest uses "Skip, surprise me". */
export const hasSignal = (input: QuizInput) =>
  input.artists.length + input.media.length + input.tags.length + input.dietary.length > 0;
