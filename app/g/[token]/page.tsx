import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { Guide } from "@/components/guide/guide";
import { Welcome } from "@/components/guest/welcome";
import { loadChatHistory, toMessageViews } from "@/lib/ai/chat-store";
import { createServiceClient } from "@/lib/db/server";
import { readServerEnv } from "@/lib/env";
import { getGuideByToken, guestStage } from "@/lib/guide/guest";
import { loadGuideView, markViewed } from "@/lib/guide/view";

/** `/g/[token]`: welcome on first open, the building screen while generating, then the guide. */
export default async function GuestPage({ params }: PageProps<"/g/[token]">) {
  const { token } = await params;
  const guide = await getGuideByToken(token);
  if (!guide) notFound();

  const stage = guestStage(guide);
  if (stage === "building") redirect(`/g/${guide.token}/building`);
  if (stage === "welcome") return <Welcome guide={guide} />;

  const [view, history] = await Promise.all([
    loadGuideView(guide.id),
    loadChatHistory(createServiceClient(), guide.id),
  ]);
  if (!view) notFound();
  after(() => markViewed(guide.id));
  return (
    <Guide
      guide={guide}
      view={view}
      chat={toMessageViews(history)}
      showCompare={readServerEnv().DEMO_MODE}
    />
  );
}
