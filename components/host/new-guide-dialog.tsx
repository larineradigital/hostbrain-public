"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import type { NewGuideResult } from "@/app/host/actions";
import { FieldError, StayFields } from "@/components/guest/stay-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { HOST_AGE_BANDS } from "@/lib/guide/new-guide";

import { CopyButton } from "./copy-button";
import { QrImage } from "./qr-dialog";

const LABELS = {
  firstName: "Guest's first name (optional)",
  firstNameHint: "Only for their greeting. Never sent to Qloo or the AI model.",
  checkIn: "Check-in",
  checkOut: "Check-out",
  partyType: "Who's travelling?",
  party: {
    solo: "Solo",
    couple: "Couple",
    family: "Family",
    friends: "Friends",
    business: "Business",
  },
};

/** H4 "New guest guide": details, then the link and QR, or straight into the quiz. */
export function NewGuideDialog({
  action,
  origin,
}: {
  action: (prev: NewGuideResult | null, data: FormData) => Promise<NewGuideResult>;
  origin: string;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A fresh form (and result) each time the dialog opens.
        if (next) setFormKey((key) => key + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          New guest guide
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-lg">
        <NewGuideForm key={formKey} action={action} origin={origin} />
      </DialogContent>
    </Dialog>
  );
}

function NewGuideForm({
  action,
  origin,
}: {
  action: (prev: NewGuideResult | null, data: FormData) => Promise<NewGuideResult>;
  origin: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  if (state?.ok) {
    const url = `${origin}/g/${state.token}`;
    return (
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>Guide created</DialogTitle>
          <DialogDescription>
            Send your guest this link or QR code. They answer three quick questions and get their
            guide.
          </DialogDescription>
        </DialogHeader>
        <p
          className="rounded-xl bg-tint px-3.5 py-2.5 font-mono text-sm break-all"
          data-testid="new-guide-url"
        >
          {url}
        </p>
        <QrImage src={`/host/guides/${state.guideId}/qr`} alt="QR code for the new guide" />
        <div className="flex flex-wrap gap-2">
          <CopyButton value={url} label="Copy the new guide link" />
          <Button asChild size="sm" variant="outline">
            <Link href={`/host/guides/${state.guideId}/print`}>Print card</Link>
          </Button>
        </div>
      </div>
    );
  }

  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const values = failed?.values ?? {};
  return (
    <form action={formAction} className="flex min-h-0 flex-col" noValidate>
      <DialogHeader className="px-6 pt-6 pb-4">
        <DialogTitle>New guest guide</DialogTitle>
        <DialogDescription>
          Your guest picks what they love; Qloo picks places around your property to match.
        </DialogDescription>
      </DialogHeader>
      {/* The fields scroll; the button stays in view on small phones. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
        <StayFields
          key={JSON.stringify(values)}
          idPrefix="new-guide"
          labels={LABELS}
          errors={errors}
          values={values}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-guide-ageBand">Age group (optional)</Label>
          <select
            id="new-guide-ageBand"
            name="ageBand"
            key={values.ageBand ?? ""}
            defaultValue={values.ageBand ?? ""}
            className="h-12 rounded-xl border border-input bg-surface px-4 text-base outline-none hover:border-ink/40 focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <option value="">Not sure</option>
            {HOST_AGE_BANDS.map((band) => (
              <option key={band.value} value={band.value}>
                {band.label}
              </option>
            ))}
          </select>
          <p id="new-guide-ageBand-hint" className="text-sm text-ink-muted">
            Helps Qloo when your guest skips the quiz.
          </p>
          <FieldError id="new-guide-ageBand-error" message={errors.ageBand} />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition-colors hover:border-ink has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="checkbox" name="fillQuiz" className="mt-0.5 size-5 accent-primary" />
          <span>
            <span className="font-semibold">Fill the quiz for them</span>
            <span className="block text-ink-muted">
              You know what they like? Answer the three questions now and the guide is ready when
              they arrive.
            </span>
          </span>
        </label>
      </div>
      <div className="flex flex-col gap-2 border-t px-6 py-4">
        {state && !state.ok && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating…" : "Create guide"}
        </Button>
      </div>
    </form>
  );
}
