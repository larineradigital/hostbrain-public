import { z } from "zod";

export const PROPERTY_TYPES = ["apartment", "house", "villa", "hotel"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** Form values arrive as strings; an empty one means "no address chosen", not 0. */
const coordinate = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number({ error: "Pick an address from the list" }).finite().min(min).max(max),
  );

export const propertyInputSchema = z.object({
  name: z.string().trim().min(1, "Give your place a name").max(120),
  type: z.enum(PROPERTY_TYPES),
  address: z.string().trim().min(3, "Pick an address from the list").max(300),
  city: z.string().trim().min(1, "Pick an address from the list").max(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  lat: coordinate(-90, 90),
  lng: coordinate(-180, 180),
  description: optionalText(2000),
  houseNotes: optionalText(2000),
});
export type PropertyInput = z.infer<typeof propertyInputSchema>;

export const MAX_HOST_PICKS = 10;
export const hostPickNoteSchema = optionalText(280);
