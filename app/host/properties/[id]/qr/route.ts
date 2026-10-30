import { connection } from "next/server";
import { z } from "zod";

import { getHost } from "@/lib/auth";
import { qrSvg, selfServeUrl, svgResponse } from "@/lib/host/qr";
import { publicOrigin } from "@/lib/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** `GET /host/properties/[id]/qr`: the hotel's self-serve link as a QR code (SVG). */
export async function GET(request: Request, { params }: RouteContext<"/host/properties/[id]/qr">) {
  await connection();
  const { id } = await params;
  if (!(await getHost())) return new Response("Sign in first", { status: 401 });
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase
    .from("properties")
    .select("self_serve_token, self_serve_enabled")
    .eq("id", id)
    .maybeSingle();
  if (!property?.self_serve_enabled || !property.self_serve_token)
    return new Response("Not found", { status: 404 });

  const svg = await qrSvg(selfServeUrl(publicOrigin(request.headers), property.self_serve_token));
  const download = new URL(request.url).searchParams.has("download");
  return svgResponse(svg, "self-serve-qr.svg", download);
}
