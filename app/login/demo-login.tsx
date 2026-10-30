"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

import { signInAsDemoHost, type DemoLoginState } from "./actions";

/** Shown only when DEMO_MODE=true (the action checks it again on the server). */
export function DemoLogin({ next }: { next: string }) {
  const t = copy.login;
  const [state, action, pending] = useActionState<DemoLoginState, FormData>(signInAsDemoHost, {
    status: "idle",
  });
  return (
    <form action={action} className="flex flex-col gap-3 rounded-3xl bg-tint p-5 sm:p-6">
      <input type="hidden" name="next" value={next} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {t.demoButton}
      </Button>
      <p className="text-sm text-ink-muted">{t.demoHint}</p>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
