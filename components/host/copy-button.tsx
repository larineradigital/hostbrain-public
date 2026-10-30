"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copies a link to the clipboard, with a short "Copied" state. */
export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "outline",
  compact = false,
}: {
  value: string;
  label: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost";
  /** Icon only below `lg` (the aria-label still names it). */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Link copied");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Couldn't copy. Select the link and copy it instead.");
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span className={compact ? "hidden lg:inline" : undefined}>
        {copied ? "Copied" : "Copy link"}
      </span>
    </Button>
  );
}
