import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/db/types";
import { createSupabaseGuideStore } from "@/lib/guide/store";
import { loadGuideView } from "@/lib/guide/view";

import type { ChatMessageView } from "./chat";
import {
  HISTORY_LIMIT,
  parseStoredMessage,
  type AssistantContent,
  type StoredChatMessage,
} from "./concierge";
import type { ConciergeData } from "./tools";

/** Reads and writes `chat_messages` with the service role, after the route checked the token. */

/** Everything a concierge turn needs about the guide, or null if it isn't there. */
export async function loadConciergeData(
  db: SupabaseClient<Database>,
  guideId: string,
): Promise<ConciergeData | null> {
  const [context, guide] = await Promise.all([
    createSupabaseGuideStore(db).load(guideId),
    loadGuideView(guideId),
  ]);
  return context && guide ? { guideId, context, guide } : null;
}

/** The latest messages, oldest first. */
export async function loadChatHistory(
  db: SupabaseClient<Database>,
  guideId: string,
  limit = HISTORY_LIMIT,
): Promise<StoredChatMessage[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("id, role, content")
    .eq("guide_id", guideId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`chat history load failed: ${error.message}`);
  return (data ?? []).reverse().flatMap((row) => {
    const message = parseStoredMessage(row);
    return message ? [message] : [];
  });
}

/** What the chat sheet shows on open. */
export function toMessageViews(history: readonly StoredChatMessage[]): ChatMessageView[] {
  return history.map((message) =>
    message.role === "user"
      ? { id: message.id, role: "user", text: message.content.text, cards: [] }
      : {
          id: message.id,
          role: "assistant",
          text: message.content.text,
          cards: message.content.cards,
        },
  );
}

/** Stores one exchange: the guest's message and the concierge's validated reply. */
export async function saveChatTurn(
  db: SupabaseClient<Database>,
  guideId: string,
  userText: string,
  reply: AssistantContent,
) {
  const { error } = await db.from("chat_messages").insert([
    { guide_id: guideId, role: "user", content: { text: userText } },
    { guide_id: guideId, role: "assistant", content: reply as unknown as NonNullable<Json> },
  ]);
  if (error) throw new Error(`chat_messages insert failed: ${error.message}`);
}
