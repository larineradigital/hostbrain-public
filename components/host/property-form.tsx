"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";

import { AddressAutocomplete, type AddressChoice } from "@/components/host/address-autocomplete";
import { PinMapLazy } from "@/components/map/pin-map-lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROPERTY_TYPES, type PropertyType } from "@/lib/host/schemas";
import { cn } from "@/lib/utils";

import type { ActionResult } from "@/app/host/actions";

export interface PropertyFormValues {
  name: string;
  type: PropertyType;
  address: string;
  city: string;
  countryCode: string | null;
  lat: number;
  lng: number;
  description: string | null;
  houseNotes: string | null;
}

interface Props {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  initial?: PropertyFormValues;
  submitLabel: string;
}

const TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  house: "House",
  villa: "Villa",
  hotel: "Hotel",
};

export function PropertyForm({ action, initial, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, data: FormData) => {
      const result = await action(prev, data);
      if (result.ok) toast.success("Saved");
      return result;
    },
    null,
  );
  const [type, setType] = useState<PropertyType>(initial?.type ?? "apartment");
  const [place, setPlace] = useState<AddressChoice | null>(
    initial
      ? {
          address: initial.address,
          city: initial.city,
          countryCode: initial.countryCode ?? undefined,
          lat: initial.lat,
          lng: initial.lng,
        }
      : null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name}
          placeholder="Alfama Sunlight Flat"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Type</legend>
        <div className="inline-flex w-fit flex-wrap gap-1 rounded-full bg-tint p-1">
          {PROPERTY_TYPES.map((value) => (
            <label
              key={value}
              className={cn(
                "flex min-h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold transition-[color,background-color,box-shadow] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                type === value
                  ? "bg-surface text-ink shadow-card dark:bg-tint-strong"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="sr-only"
              />
              {TYPE_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="address-search">Address</Label>
        <AddressAutocomplete
          id="address-search"
          defaultValue={initial?.address}
          invalid={!!errors.address}
          onSelect={setPlace}
          onEdit={() => setPlace(null)}
        />
        <FieldError id="address-error" message={errors.address} />
        <input type="hidden" name="address" value={place?.address ?? ""} />
        <input type="hidden" name="city" value={place?.city ?? ""} />
        <input type="hidden" name="countryCode" value={place?.countryCode ?? ""} />
        <input type="hidden" name="lat" value={place?.lat ?? ""} />
        <input type="hidden" name="lng" value={place?.lng ?? ""} />
        {place ? (
          <div className="flex flex-col gap-2">
            <PinMapLazy
              lat={place.lat}
              lng={place.lng}
              onMove={(point) =>
                setPlace((current) => (current ? { ...current, ...point } : current))
              }
            />
            <p className="text-sm text-ink-muted">
              Drag the pin to the front door if it&apos;s a little off.
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            Pick your address from the list to place it on the map.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={initial?.description ?? ""}
          placeholder="A sunny two-bedroom flat in the old town, five minutes from the river."
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="houseNotes">House notes</Label>
        <Textarea
          id="houseNotes"
          name="houseNotes"
          maxLength={2000}
          defaultValue={initial?.houseNotes ?? ""}
          placeholder="Wi-Fi: Alfama-Guest / password on the fridge. Check-out by 11:00."
          aria-describedby="houseNotes-hint"
        />
        <p id="houseNotes-hint" className="text-sm text-ink-muted">
          Shown at the bottom of every guest guide.
        </p>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
