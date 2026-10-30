"use client";

import { useActionState } from "react";

import type { SelfServeActionResult } from "@/app/s/[propertyToken]/actions";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

import { StayFields } from "./stay-fields";

/** G0 for hotels: first name (optional), dates and party type, then the quiz. */
export function SelfServeForm({
  action,
}: {
  action: (prev: SelfServeActionResult | null, data: FormData) => Promise<SelfServeActionResult>;
}) {
  const t = copy.guest.selfServe;
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <StayFields
        key={JSON.stringify(state?.values ?? {})}
        idPrefix="self-serve"
        labels={t}
        errors={state?.fieldErrors ?? {}}
        values={state?.values}
      />
      {state && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t.starting : t.start}
      </Button>
    </form>
  );
}
