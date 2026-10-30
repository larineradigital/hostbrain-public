import { expect, test } from "@playwright/test";

import { admin, newHostClient } from "./helpers/auth";

// Generation through the SSE route in mock mode, and RLS on the guide tables.
// Database-level checks, so they run once (desktop project).

const TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
const token = () =>
  Array.from({ length: 21 }, () => TOKEN_CHARS[Math.floor(Math.random() * 64)]).join("");

async function createGuide(hostId: string, partyType: "couple" | "family" = "couple") {
  const db = admin();
  const { data: property, error } = await db
    .from("properties")
    .insert({
      host_id: hostId,
      name: "E2E Flat",
      address: "12 Fable Street, Old Harbour",
      city: "Lisbon",
      lat: 38.7139,
      lng: -9.1394,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // Same keys on every row: a bulk insert sends missing keys as null, not the default.
  const { error: picksError } = await db.from("host_picks").insert([
    {
      property_id: property.id,
      qloo_entity_id: "FIX-P-001",
      name: "Lantern & Ladle",
      note: "Stew",
      position: 0,
    },
    {
      property_id: property.id,
      qloo_entity_id: "FIX-P-020",
      name: "Gallery",
      note: null,
      position: 1,
    },
  ]);
  if (picksError) throw new Error(picksError.message);
  const guideToken = token();
  const { data: guide, error: guideError } = await db
    .from("guides")
    .insert({
      property_id: property.id,
      token: guideToken,
      guest_first_name: "Zelda",
      party_type: partyType,
    })
    .select("id")
    .single();
  if (guideError) throw new Error(guideError.message);
  await db.from("quiz_answers").insert({
    guide_id: guide.id,
    artist_ids: ["FIX-A-001"],
    artist_names: ["Mara Solé"],
    media_ids: ["FIX-M-001"],
    media_names: ["A Quiet Tram to Nowhere"],
    tag_urns: ["urn:tag:cuisine:qloo:natural_wine"],
    tag_labels: ["natural_wine"],
  });
  return { propertyId: property.id, guideId: guide.id, token: guideToken };
}

function events(body: string) {
  return body
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as { type: string; step?: string; status?: string });
}

test("a guest's token generates the guide over SSE and stores every section", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const host = await newHostClient();
  try {
    const { guideId, token: guideToken } = await createGuide(host.id);

    // Wrong token and no session: indistinguishable from a missing guide.
    const wrong = await request.post(`/api/guides/${guideId}/generate`, {
      data: { token: token() },
    });
    expect(wrong.status()).toBe(404);
    expect((await request.post(`/api/guides/${guideId}/generate`)).status()).toBe(404);

    const response = await request.post(`/api/guides/${guideId}/generate`, {
      data: { token: guideToken },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/event-stream");
    const stream = events(await response.text());
    expect(stream.at(-1)).toEqual({ type: "done", guideId, token: guideToken });
    for (const step of ["eat", "drink", "do", "rainy", "host_picks", "playlist", "writing"]) {
      expect(stream).toContainEqual(
        expect.objectContaining({ type: "step", step, status: "done" }),
      );
    }

    const db = admin();
    const { data: guide } = await db
      .from("guides")
      .select("status, hero_line, generated_at")
      .eq("id", guideId)
      .single();
    expect(guide).toMatchObject({
      status: "ready",
      hero_line: "Your Lisbon, picked for your taste",
    });
    const { data: sections } = await db
      .from("guide_sections")
      .select("section, intro, items, qloo_request")
      .eq("guide_id", guideId);
    expect(sections).toHaveLength(8);
    const eat = sections!.find((s) => s.section === "eat")!;
    expect(eat.items).toHaveLength(6);
    expect(JSON.stringify(sections)).not.toContain("Zelda");
    const picks = sections!.find((s) => s.section === "host_picks")!.items as Array<{
      entity_id: string;
    }>;
    expect(picks.map((p) => p.entity_id).sort()).toEqual(["FIX-P-001", "FIX-P-020"]);
    expect(
      (await db.from("heatmaps").select("guide_id").eq("guide_id", guideId)).data,
    ).toHaveLength(1);

    // A ready guide answers straight away with `done`, without regenerating.
    const again = await request.post(`/api/guides/${guideId}/generate`, {
      data: { token: guideToken },
    });
    expect(events(await again.text())).toEqual([{ type: "done", guideId, token: guideToken }]);
  } finally {
    await host.cleanup();
  }
});

test("a host can't read another host's guides, quiz answers or sections", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const a = await newHostClient();
  const b = await newHostClient();
  try {
    const { guideId, token: guideToken } = await createGuide(a.id, "family");
    await request.post(`/api/guides/${guideId}/generate`, { data: { token: guideToken } });

    // A sees their own guide and its rows.
    expect((await a.client.from("guides").select("id")).data).toEqual([{ id: guideId }]);
    expect((await a.client.from("quiz_answers").select("guide_id")).data).toHaveLength(1);
    expect((await a.client.from("guide_sections").select("section")).data).toHaveLength(8);

    // B sees and changes nothing.
    for (const table of ["guides", "quiz_answers", "guide_sections", "heatmaps"] as const) {
      expect((await b.client.from(table).select("*")).data).toEqual([]);
    }
    await b.client.from("guides").update({ status: "failed" }).eq("id", guideId);
    await b.client.from("guide_sections").delete().eq("guide_id", guideId);
    const { data: still } = await admin()
      .from("guides")
      .select("status")
      .eq("id", guideId)
      .single();
    expect(still!.status).toBe("ready");
    expect((await a.client.from("guide_sections").select("section")).data).toHaveLength(8);
    const insert = await b.client
      .from("quiz_answers")
      .upsert({ guide_id: guideId, artist_ids: [], artist_names: [] });
    expect(insert.error).not.toBeNull();
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
