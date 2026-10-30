import { connection } from "next/server";
import { z } from "zod";

import { getHost } from "@/lib/auth";
import { guideUrl, qrSvg, svgResponse } from "@/lib/host/qr";
import { publicOrigin } from "@/lib/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** `GET /host/guides/[id]/qr`: the guide link as a QR code (SVG). Host only, via RLS. */
export async function GET(request: Request, { params }: RouteContext<"/host/guides/[id]/qr">) {
  await connection();
  const { id } = await params;
  if (!(await getHost())) return new Response("Sign in first", { status: 401 });
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data: guide } = await supabase.from("guides").select("token").eq("id", id).maybeSingle();
  if (!guide) return new Response("Not found", { status: 404 });

  const svg = await qrSvg(guideUrl(publicOrigin(request.headers), guide.token));
  const download = new URL(request.url).searchParams.has("download");
  return svgResponse(svg, "guest-guide-qr.svg", download);
}
