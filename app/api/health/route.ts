import { connection } from "next/server";

import { readServerEnv } from "@/lib/env";

export async function GET() {
  await connection();
  const env = readServerEnv();
  return Response.json({
    ok: true,
    qlooMode: env.QLOO_MODE,
    llmProvider: env.LLM_PROVIDER,
    model: env.OPENAI_MODEL,
  });
}
