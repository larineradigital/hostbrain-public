import { expect, test } from "@playwright/test";

import { admin, newHostClient } from "./helpers/auth";

// Row-level security on hosts, properties and host_picks No browser needed.
test("a host can't read or change another host's property or picks", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const a = await newHostClient();
  const b = await newHostClient();
  try {
    const { data: property, error } = await a.client
      .from("properties")
      .insert({
        host_id: a.id,
        name: "RLS Flat",
        address: "1 Test Lane",
        city: "Lisbon",
        lat: 38.71,
        lng: -9.13,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { error: pickError } = await a.client
      .from("host_picks")
      .insert({ property_id: property!.id, qloo_entity_id: "FIX-P-001", name: "Lantern & Ladle" });
    expect(pickError).toBeNull();

    // B sees nothing of A's.
    expect((await b.client.from("properties").select("id")).data).toEqual([]);
    expect((await b.client.from("host_picks").select("id")).data).toEqual([]);
    expect((await b.client.from("hosts").select("id")).data).toEqual([{ id: b.id }]);

    // B can't edit or delete A's rows (RLS filters them out, so nothing changes).
    const update = await b.client
      .from("properties")
      .update({ name: "Hijacked" })
      .eq("id", property!.id)
      .select();
    expect(update.data).toEqual([]);
    await b.client.from("host_picks").delete().eq("property_id", property!.id);
    expect((await a.client.from("host_picks").select("id")).data).toHaveLength(1);

    // B can't attach a pick to A's property or create a property as A.
    const foreignPick = await b.client
      .from("host_picks")
      .insert({ property_id: property!.id, qloo_entity_id: "FIX-P-002", name: "Casa Marmelo" });
    expect(foreignPick.error).not.toBeNull();
    const spoofed = await b.client
      .from("properties")
      .insert({ host_id: a.id, name: "Spoof", address: "x", city: "x", lat: 0, lng: 0 });
    expect(spoofed.error).not.toBeNull();

    // Anonymous visitors see nothing.
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
      },
    );
    expect((await anon.from("properties").select("id")).data).toEqual([]);
    expect((await anon.from("qloo_cache").select("key")).data).toEqual([]);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

test("a property can have at most 10 host picks", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const a = await newHostClient();
  try {
    const { data: property } = await a.client
      .from("properties")
      .insert({
        host_id: a.id,
        name: "Limit Flat",
        address: "1 Test Lane",
        city: "Lisbon",
        lat: 38.71,
        lng: -9.13,
      })
      .select("id")
      .single();
    const picks = Array.from({ length: 10 }, (_, i) => ({
      property_id: property!.id,
      qloo_entity_id: `FIX-P-${String(i + 1).padStart(3, "0")}`,
      name: `Fixture ${i + 1}`,
      position: i,
    }));
    for (const pick of picks)
      expect((await a.client.from("host_picks").insert(pick)).error).toBeNull();
    const eleventh = await a.client
      .from("host_picks")
      .insert({ property_id: property!.id, qloo_entity_id: "FIX-P-011", name: "One too many" });
    expect(eleventh.error?.message).toContain("at most 10");
  } finally {
    await a.cleanup();
  }
});

// Concierge chats follow the guide (guides → properties.host_id).
test("a host reads only their own guides' concierge chats", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const a = await newHostClient();
  const b = await newHostClient();
  try {
    const { data: property } = await a.client
      .from("properties")
      .insert({
        host_id: a.id,
        name: "Chat Flat",
        address: "2 Test Lane",
        city: "Lisbon",
        lat: 38.71,
        lng: -9.13,
      })
      .select("id")
      .single();
    const { data: guide, error } = await a.client
      .from("guides")
      .insert({
        property_id: property!.id,
        token: `rls${Math.random().toString(36).slice(2).padEnd(18, "x").slice(0, 18)}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    // Chats are written by the chat route with the service role; hosts only read them.
    const own = await admin()
      .from("chat_messages")
      .insert({ guide_id: guide!.id, role: "user", content: { text: "Coffee nearby?" } });
    expect(own.error).toBeNull();
    const ownWrite = await a.client
      .from("chat_messages")
      .insert({ guide_id: guide!.id, role: "assistant", content: { text: "Forged" } });
    expect(ownWrite.error).not.toBeNull();
    expect((await a.client.from("chat_messages").select("id")).data).toHaveLength(1);

    expect((await b.client.from("chat_messages").select("id")).data).toEqual([]);
    const foreign = await b.client
      .from("chat_messages")
      .insert({ guide_id: guide!.id, role: "user", content: { text: "Hijack" } });
    expect(foreign.error).not.toBeNull();

    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await anon.from("chat_messages").select("id")).data).toEqual([]);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

// AI-alone comparisons follow the guide; self-serve tokens are only readable by the host.
test("a host reads only their own guides' comparisons", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const a = await newHostClient();
  const b = await newHostClient();
  try {
    const { data: property } = await a.client
      .from("properties")
      .insert({
        host_id: a.id,
        name: "Compare Hotel",
        type: "hotel",
        address: "3 Test Lane",
        city: "Lisbon",
        lat: 38.71,
        lng: -9.13,
        self_serve_enabled: true,
        self_serve_token: `ss${Math.random().toString(36).slice(2).padEnd(19, "x").slice(0, 19)}`,
      })
      .select("id")
      .single();
    const { data: guide } = await a.client
      .from("guides")
      .insert({
        property_id: property!.id,
        token: `rls${Math.random().toString(36).slice(2).padEnd(18, "x").slice(0, 18)}`,
      })
      .select("id")
      .single();
    const row = {
      guide_id: guide!.id,
      ai_alone: [],
      summary: {},
      guest_description: "a couple",
    };
    expect((await a.client.from("comparisons").insert(row)).error).not.toBeNull();
    expect((await admin().from("comparisons").insert(row)).error).toBeNull();
    expect((await a.client.from("comparisons").select("guide_id")).data).toHaveLength(1);

    expect((await b.client.from("comparisons").select("guide_id")).data).toEqual([]);
    expect(
      (
        await b.client
          .from("comparisons")
          .update({ guest_description: "x" })
          .eq("guide_id", guide!.id)
          .select()
      ).error,
    ).not.toBeNull();
    expect((await b.client.from("properties").select("self_serve_token")).data).toEqual([]);

    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await anon.from("comparisons").select("guide_id")).data).toEqual([]);
    expect((await anon.from("properties").select("self_serve_token")).data).toEqual([]);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

// Every table, a second host, anonymous visitors, and what a host may write at all.
const TABLES = [
  "hosts",
  "properties",
  "host_picks",
  "guides",
  "quiz_answers",
  "guide_sections",
  "heatmaps",
  "chat_messages",
  "comparisons",
  "qloo_cache",
  "qloo_tag_map",
  "api_log",
] as const;
const GUIDE_TABLES = [
  "quiz_answers",
  "guide_sections",
  "heatmaps",
  "chat_messages",
  "comparisons",
] as const;

const randomToken = (prefix: string) =>
  `${prefix}${Math.random().toString(36).slice(2)}${"x".repeat(21)}`.slice(0, 21);

async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

test("RLS holds on every table for a second host and for anonymous visitors", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const a = await newHostClient();
  const b = await newHostClient();
  const db = admin();
  try {
    const { data: property } = await a.client
      .from("properties")
      .insert({
        host_id: a.id,
        name: "All Tables Flat",
        address: "4 Test Lane",
        city: "Lisbon",
        lat: 38.71,
        lng: -9.13,
      })
      .select("id")
      .single();
    await a.client
      .from("host_picks")
      .insert({ property_id: property!.id, qloo_entity_id: "FIX-P-001", name: "Lantern & Ladle" });
    const { data: guide, error: guideError } = await a.client
      .from("guides")
      .insert({ property_id: property!.id, token: randomToken("rlsA") })
      .select("id")
      .single();
    expect(guideError).toBeNull();
    const guideId = guide!.id;
    // Generated rows come from server code (service role).
    const seeded = await Promise.all([
      db.from("quiz_answers").insert({ guide_id: guideId, skipped: true }),
      db.from("guide_sections").insert({ guide_id: guideId, section: "eat", items: [] }),
      db.from("heatmaps").insert({ guide_id: guideId, cells: [] }),
      db.from("chat_messages").insert({ guide_id: guideId, role: "user", content: { text: "Hi" } }),
      db
        .from("comparisons")
        .insert({ guide_id: guideId, ai_alone: [], summary: {}, guest_description: "a couple" }),
    ]);
    for (const { error } of seeded) expect(error).toBeNull();

    // A reads their own rows in every host table.
    for (const table of ["properties", "host_picks", "guides", ...GUIDE_TABLES] as const) {
      expect((await a.client.from(table).select("*")).data, table).toHaveLength(1);
    }

    // B and anonymous visitors read nothing of A's; server-only tables are closed to everyone.
    const anon = await anonClient();
    for (const table of TABLES) {
      const forB = (await b.client.from(table).select("*")).data;
      expect(forB, `B reads ${table}`).toEqual(
        table === "hosts" ? [expect.objectContaining({ id: b.id })] : [],
      );
      expect((await anon.from(table).select("*")).data, `anon reads ${table}`).toEqual([]);
    }
    for (const table of ["qloo_cache", "qloo_tag_map", "api_log"] as const) {
      expect((await a.client.from(table).select("*")).data, `A reads ${table}`).toEqual([]);
    }

    // Nobody writes generated rows with a session, not even the guide's own host.
    for (const client of [a.client, b.client, anon]) {
      const writes = await Promise.all([
        client.from("guide_sections").insert({ guide_id: guideId, section: "drink", items: [] }),
        client.from("heatmaps").upsert({ guide_id: guideId, cells: [] }),
        client.from("quiz_answers").upsert({ guide_id: guideId, skipped: false }),
        client.from("chat_messages").insert({ guide_id: guideId, role: "assistant", content: {} }),
        client
          .from("comparisons")
          .upsert({ guide_id: guideId, ai_alone: [], summary: {}, guest_description: "x" }),
        client.from("api_log").insert({ provider: "qloo", endpoint: "/forged" }),
        client.from("qloo_cache").insert({
          key: "forged",
          endpoint: "/search",
          response: {},
          expires_at: new Date().toISOString(),
        }),
      ]);
      for (const { error } of writes) expect(error).not.toBeNull();
    }
    await a.client.from("guide_sections").update({ intro: "Forged" }).eq("guide_id", guideId);
    await a.client.from("guide_sections").delete().eq("guide_id", guideId);
    const { data: section } = await db
      .from("guide_sections")
      .select("intro")
      .eq("guide_id", guideId)
      .single();
    expect(section?.intro).toBeNull();

    // Server-owned guide columns and deletes are off limits to hosts.
    expect(
      (await a.client.from("guides").update({ status: "ready" }).eq("id", guideId)).error,
    ).not.toBeNull();
    expect(
      (await a.client.from("guides").update({ check_in: "2026-11-01" }).eq("id", guideId)).error,
    ).toBeNull();
    await a.client.from("guides").delete().eq("id", guideId);
    await a.client.from("properties").delete().eq("id", property!.id);
    await a.client.from("hosts").delete().eq("id", a.id);
    expect((await db.from("guides").select("id").eq("id", guideId)).data).toHaveLength(1);
    expect((await db.from("properties").select("id").eq("id", property!.id)).data).toHaveLength(1);
    expect((await db.from("hosts").select("id").eq("id", a.id)).data).toHaveLength(1);
    expect(
      (await a.client.from("properties").update({ demo_key: "P1" }).eq("id", property!.id)).error,
    ).not.toBeNull();

    // B changes nothing of A's.
    await b.client.from("guides").update({ guest_first_name: "Hijack" }).eq("id", guideId);
    await b.client.from("properties").update({ name: "Hijack" }).eq("id", property!.id);
    await b.client.from("host_picks").update({ note: "Hijack" }).eq("property_id", property!.id);
    await b.client.from("hosts").update({ display_name: "Hijack" }).eq("id", a.id);
    const after = await Promise.all([
      db.from("guides").select("guest_first_name").eq("id", guideId).single(),
      db.from("properties").select("name").eq("id", property!.id).single(),
      db.from("host_picks").select("note").eq("property_id", property!.id).single(),
      db.from("hosts").select("display_name").eq("id", a.id).single(),
    ]);
    for (const r of after) expect(JSON.stringify(r.data)).not.toContain("Hijack");

    // The demo-host lookup is for the service role only.
    for (const client of [a.client, anon]) {
      const rpc = await client.rpc("demo_host_id", { target_email: "x@example.test" });
      expect(rpc.error).not.toBeNull();
    }
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

// DEMO_MODE lets anyone sign in as the demo host, so seeded demo rows are read-only.
test("seeded demo rows are read-only for a signed-in host", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "database check, run once");
  const a = await newHostClient();
  const db = admin();
  try {
    const { data: property } = await db
      .from("properties")
      .insert({
        host_id: a.id,
        name: "Demo Flat",
        type: "hotel",
        address: "5 Test Lane",
        city: "Lisbon",
        lat: 38.71,
        lng: -9.13,
        demo_key: "RLS",
      })
      .select("id")
      .single();
    await db
      .from("host_picks")
      .insert({ property_id: property!.id, qloo_entity_id: "FIX-P-001", name: "Lantern & Ladle" });
    const { data: demoGuide } = await db
      .from("guides")
      .insert({ property_id: property!.id, token: randomToken("rlsD"), demo_key: "A" })
      .select("id")
      .single();

    const rename = await a.client
      .from("properties")
      .update({ house_notes: "Defaced" })
      .eq("id", property!.id);
    expect(rename.error?.message).toContain("read-only");
    const selfServe = await a.client
      .from("properties")
      .update({ self_serve_enabled: true, self_serve_token: randomToken("rlsS") })
      .eq("id", property!.id)
      .select("self_serve_enabled");
    expect(selfServe.error).toBeNull();
    expect(selfServe.data).toEqual([{ self_serve_enabled: true }]);

    expect(
      (
        await a.client
          .from("host_picks")
          .update({ note: "Defaced" })
          .eq("property_id", property!.id)
      ).error?.message,
    ).toContain("read-only");
    expect(
      (await a.client.from("host_picks").delete().eq("property_id", property!.id)).error?.message,
    ).toContain("read-only");
    expect(
      (
        await a.client
          .from("host_picks")
          .insert({ property_id: property!.id, qloo_entity_id: "FIX-P-002", name: "Casa Marmelo" })
      ).error?.message,
    ).toContain("read-only");
    expect(
      (
        await a.client
          .from("guides")
          .update({ guest_first_name: "Defaced" })
          .eq("id", demoGuide!.id)
      ).error?.message,
    ).toContain("read-only");

    // New guides on the demo flat are fine (judges create one in the host flow).
    const fresh = await a.client
      .from("guides")
      .insert({ property_id: property!.id, token: randomToken("rlsN") })
      .select("id")
      .single();
    expect(fresh.error).toBeNull();
    expect(
      (await a.client.from("guides").update({ guest_first_name: "Ana" }).eq("id", fresh.data!.id))
        .error,
    ).toBeNull();
  } finally {
    await a.cleanup();
  }
});
