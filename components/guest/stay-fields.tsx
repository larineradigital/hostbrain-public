"use client";

import { useState } from "react";

import { Check } from "lucide-react";

import { chipVariants } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PARTY_TYPES, type PartyType } from "@/lib/guide/types";
import { cn } from "@/lib/utils";

export interface StayFieldLabels {
  firstName: string;
  firstNameHint?: string;
  checkIn: string;
  checkOut: string;
  partyType: string;
  party: Record<PartyType, string>;
}

/**
 * First name, dates and party type: shared by the hotel self-serve entry and
 * the host's "New guest guide" dialog. Field names match `parseNewGuide`.
 */
export function StayFields({
  labels,
  errors,
  idPrefix = "stay",
  values = {},
}: {
  labels: StayFieldLabels;
  errors: Record<string, string>;
  idPrefix?: string;
  /** Last submitted values: React resets the form after an action, so refill from these. */
  values?: Record<string, string>;
}) {
  const [party, setParty] = useState<PartyType>(
    PARTY_TYPES.find((p) => p === values.partyType) ?? "couple",
  );
  const id = (name: string) => `${idPrefix}-${name}`;
  const described = (name: string, hint?: boolean) =>
    [errors[name] && id(`${name}-error`), hint && id(`${name}-hint`)].filter(Boolean).join(" ") ||
    undefined;
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("firstName")}>{labels.firstName}</Label>
        <Input
          id={id("firstName")}
          name="firstName"
          maxLength={60}
          defaultValue={values.firstName}
          autoComplete="given-name"
          aria-invalid={!!errors.firstName || undefined}
          aria-describedby={described("firstName", !!labels.firstNameHint)}
        />
        {labels.firstNameHint && (
          <p id={id("firstName-hint")} className="text-sm text-ink-muted">
            {labels.firstNameHint}
          </p>
        )}
        <FieldError id={id("firstName-error")} message={errors.firstName} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["checkIn", "checkOut"] as const).map((name) => (
          <div key={name} className="flex flex-col gap-2">
            <Label htmlFor={id(name)}>{labels[name]}</Label>
            <Input
              id={id(name)}
              name={name}
              type="date"
              defaultValue={values[name]}
              aria-invalid={!!errors[name] || undefined}
              aria-describedby={described(name)}
            />
            <FieldError id={id(`${name}-error`)} message={errors[name]} />
          </div>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{labels.partyType}</legend>
        <div className="flex flex-wrap gap-2">
          {PARTY_TYPES.map((value) => (
            <label
              key={value}
              className={cn(
                chipVariants({ size: "md" }),
                "cursor-pointer gap-2 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                party === value ? "border-brand bg-brand text-accent-ink" : "hover:border-ink",
              )}
            >
              <input
                type="radio"
                name="partyType"
                value={value}
                checked={party === value}
                onChange={() => setParty(value)}
                className="sr-only"
              />
              {party === value && <Check aria-hidden />}
              {labels.party[value]}
            </label>
          ))}
        </div>
        <FieldError id={id("partyType-error")} message={errors.partyType} />
      </fieldset>
    </>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
