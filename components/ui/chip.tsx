import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Pills for taste signals, filters and quiz picks. Static chips are spans; toggles
 * are buttons with `aria-pressed`, which switches them to the brand fill.
 */
const chipVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        outline: "border-line bg-surface text-ink",
        soft: "border-transparent bg-tint text-ink",
        brand: "border-transparent bg-brand-soft text-brand",
      },
      size: {
        sm: "h-8 px-3",
        md: "min-h-11 px-4",
      },
    },
    defaultVariants: { variant: "outline", size: "sm" },
  }
)

/** The interactive part: hover, focus ring, pressed = brand fill. */
const chipToggle =
  "cursor-pointer outline-none hover:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-accent-ink"

function Chip({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
  return (
    <span data-slot="chip" className={cn(chipVariants({ variant, size }), className)} {...props} />
  )
}

function ChipButton({
  className,
  variant,
  size = "md",
  type = "button",
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof chipVariants>) {
  return (
    <button
      type={type}
      data-slot="chip"
      className={cn(chipVariants({ variant, size }), chipToggle, className)}
      {...props}
    />
  )
}

export { Chip, ChipButton, chipVariants, chipToggle }
