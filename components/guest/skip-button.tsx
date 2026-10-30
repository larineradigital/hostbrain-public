"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { skipQuiz } from "@/app/g/[token]/actions";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/** "Skip, surprise me": saves a skipped quiz and goes to the building screen. */
export function SkipButton({ token, className }: { token: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="link"
      className={cn(
        "min-h-11 font-semibold text-ink underline underline-offset-4 hover:text-brand",
        className,
      )}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await skipQuiz(token);
          if (result && !result.ok) toast.error(result.error);
        })
      }
    >
      {copy.guest.welcome.skip}
    </Button>
  );
}
