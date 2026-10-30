"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireHost } from "@/lib/auth";
import { newGuideFieldErrors, newGuideValues, parseNewGuide } from "@/lib/guide/new-guide";
import { newGuideToken } from "@/lib/guide/token";
import { hostPickNoteSchema, MAX_HOST_PICKS, propertyInputSchema } from "@/lib/host/schemas";
import { searchPlaces } from "@/lib/qloo/endpoints";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function formToProperty(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  return propertyInputSchema.safeParse({
    name: get("name"),
    type: get("type"),
    address: get("address"),
    city: get("city"),
    countryCode: get("countryCode") ?? null,
    lat: get("lat"),
    lng: get("lng"),
    description: get("description") ?? null,
    houseNotes: get("houseNotes") ?? null,
  });
}

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  if (out.lat || out.lng) out.address ??= "Pick an address from the list";
  return out;
}

export async function createProperty(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const host = await requireHost("/host/properties/new");
  const parsed = formToProperty(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }
  const p = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({
      host_id: host.id,
      name: p.name,
      type: p.type,
      address: p.address,
      city: p.city,
      country_code: p.countryCode ?? null,
      lat: p.lat,
      lng: p.lng,
      description: p.description ?? null,
      house_notes: p.houseNotes ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: "We couldn't save your property. Please try again." };

  revalidatePath("/host");
  redirect(`/host/properties/${data.id}?tab=spots`);
}

export async function updateProperty(
  propertyId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireHost(`/host/properties/${propertyId}`);
  const parsed = formToProperty(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }
  const p = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("properties")
    .update({
      name: p.name,
      type: p.type,
      address: p.address,
      city: p.city,
      country_code: p.countryCode ?? null,
      lat: p.lat,
      lng: p.lng,
      description: p.description ?? null,
      house_notes: p.houseNotes ?? null,
    })
    .eq("id", propertyId)
    .select("id");
  if (error || !data?.length)
    return { ok: false, error: "We couldn't save your changes. Please try again." };

  revalidatePath("/host");
  revalidatePath(`/host/properties/${propertyId}`);
  return { ok: true };
}

const addPickSchema = z.object({
  propertyId: z.uuid(),
  entityId: z.string().min(1).max(100),
  query: z.string().trim().min(2).max(80),
  note: hostPickNoteSchema,
});

/**
 * Adds a Qloo place as a host pick. The browser only sends the entity ID and the search
 * it came from; the server repeats that search (a cache hit) and takes the name and
 * address from Qloo, so a pick is always a real Qloo entity near the property.
 */
export async function addHostPick(input: z.input<typeof addPickSchema>): Promise<ActionResult> {
  const parsed = addPickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That pick couldn't be added." };
  const { propertyId, entityId, query, note } = parsed.data;
  await requireHost(`/host/properties/${propertyId}`);

  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, lat, lng, host_picks(count)")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) return { ok: false, error: "Property not found." };
  const count = (property.host_picks as unknown as { count: number }[])[0]?.count ?? 0;
  if (count >= MAX_HOST_PICKS)
    return { ok: false, error: `You can add up to ${MAX_HOST_PICKS} favourite spots.` };

  const result = await searchPlaces({
    query,
    near: { lat: property.lat, lng: property.lng },
    radiusM: 3000,
    take: 8,
  });
  const entity = result.items.find((e) => e.entityId === entityId);
  if (!entity)
    return { ok: false, error: "We couldn't confirm that place with Qloo. Search again." };

  const { error } = await supabase.from("host_picks").insert({
    property_id: propertyId,
    qloo_entity_id: entity.entityId,
    name: entity.name,
    address: entity.properties.address ?? null,
    note: note ?? null,
    position: count,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That place is already in your list." };
    return { ok: false, error: "We couldn't add that place. Please try again." };
  }
  revalidatePath(`/host/properties/${propertyId}`);
  return { ok: true };
}

const pickIdSchema = z.uuid();

async function loadPick(pickId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("host_picks")
    .select("id, property_id, position")
    .eq("id", pickId)
    .maybeSingle();
  return { supabase, pick: data };
}

export async function updateHostPickNote(pickId: string, note: string): Promise<ActionResult> {
  await requireHost();
  const id = pickIdSchema.safeParse(pickId);
  const parsedNote = hostPickNoteSchema.safeParse(note);
  if (!id.success || !parsedNote.success)
    return { ok: false, error: "Notes can be up to 280 characters." };
  const { supabase, pick } = await loadPick(id.data);
  if (!pick) return { ok: false, error: "Pick not found." };
  const { error } = await supabase
    .from("host_picks")
    .update({ note: parsedNote.data ?? null })
    .eq("id", pick.id);
  if (error) return { ok: false, error: "We couldn't save the note." };
  revalidatePath(`/host/properties/${pick.property_id}`);
  return { ok: true };
}

export async function moveHostPick(
  pickId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await requireHost();
  const id = pickIdSchema.safeParse(pickId);
  if (!id.success) return { ok: false, error: "Pick not found." };
  const { supabase, pick } = await loadPick(id.data);
  if (!pick) return { ok: false, error: "Pick not found." };

  const { data: picks } = await supabase
    .from("host_picks")
    .select("id, position, created_at")
    .eq("property_id", pick.property_id)
    .order("position")
    .order("created_at");
  if (!picks) return { ok: false, error: "We couldn't reorder your picks." };
  const order = picks.map((p) => p.id);
  const from = order.indexOf(pick.id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= order.length) return { ok: true };
  [order[from], order[to]] = [order[to], order[from]];

  // Rewrite positions 0..n-1 so gaps and ties from earlier edits disappear.
  const updates = order
    .map((id, position) => ({ id, position }))
    .filter(({ id, position }) => picks.find((p) => p.id === id)?.position !== position);
  for (const { id, position } of updates) {
    const { error } = await supabase.from("host_picks").update({ position }).eq("id", id);
    if (error) return { ok: false, error: "We couldn't reorder your picks." };
  }
  revalidatePath(`/host/properties/${pick.property_id}`);
  return { ok: true };
}

export async function removeHostPick(pickId: string): Promise<ActionResult> {
  await requireHost();
  const id = pickIdSchema.safeParse(pickId);
  if (!id.success) return { ok: false, error: "Pick not found." };
  const { supabase, pick } = await loadPick(id.data);
  if (!pick) return { ok: false, error: "Pick not found." };
  const { error } = await supabase.from("host_picks").delete().eq("id", pick.id);
  if (error) return { ok: false, error: "We couldn't remove that place." };
  revalidatePath(`/host/properties/${pick.property_id}`);
  return { ok: true };
}

export type NewGuideResult =
  | { ok: true; guideId: string; token: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    };

/**
 * H4 "New guest guide": a guide with source `host`. With "fill the quiz for them" the host
 * goes straight to the guest's quiz; otherwise the dialog shows the link and QR code.
 */
export async function createGuestGuide(
  propertyId: string,
  _prev: NewGuideResult | null,
  formData: FormData,
): Promise<NewGuideResult> {
  await requireHost(`/host/properties/${propertyId}`);
  if (!z.uuid().safeParse(propertyId).success) return { ok: false, error: "Property not found." };
  const parsed = parseNewGuide(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: newGuideFieldErrors(parsed.error),
      values: newGuideValues(formData),
    };
  }
  const g = parsed.data;
  const supabase = await createSupabaseServerClient();
  const token = newGuideToken();
  // RLS: the insert only succeeds for one of the host's own properties.
  const { data, error } = await supabase
    .from("guides")
    .insert({
      property_id: propertyId,
      token,
      guest_first_name: g.firstName,
      check_in: g.checkIn,
      check_out: g.checkOut,
      party_type: g.partyType,
      age_band: g.ageBand,
      source: "host",
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: "We couldn't create the guide. Please try again.",
      values: newGuideValues(formData),
    };
  }

  revalidatePath(`/host/properties/${propertyId}`);
  if (formData.get("fillQuiz") === "on") redirect(`/g/${token}/quiz`);
  return { ok: true, guideId: data.id, token };
}

/** Turns hotel self-serve on or off. The token is made once and kept, so printed cards keep working. */
export async function setSelfServe(propertyId: string, enabled: boolean): Promise<ActionResult> {
  await requireHost(`/host/properties/${propertyId}`);
  if (!z.uuid().safeParse(propertyId).success) return { ok: false, error: "Property not found." };
  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, self_serve_token")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) return { ok: false, error: "Property not found." };
  const { error } = await supabase
    .from("properties")
    .update({
      self_serve_enabled: enabled,
      self_serve_token: property.self_serve_token ?? (enabled ? newGuideToken() : null),
    })
    .eq("id", propertyId);
  if (error) return { ok: false, error: "We couldn't change self-serve. Please try again." };
  revalidatePath(`/host/properties/${propertyId}`);
  return { ok: true };
}
