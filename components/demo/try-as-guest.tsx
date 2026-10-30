"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { tryAsGuest } from "@/app/demo/actions";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

function Submit({ label, variant }: { label: string; variant: "default" | "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      variant={variant}
      disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? copy.demo.try.pending : label}
    </Button>
  );
}

/** "Try as a guest": a form, so the guide is only created on a real click (never a prefetch). */
export function TryAsGuestButton({
  label = copy.demo.try.button,
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline";
}) {
  return (
    <form action={tryAsGuest} className="contents">
      <Submit label={label} variant={variant} />
    </form>
  );
}
