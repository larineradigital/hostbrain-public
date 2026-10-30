import { cn } from "cn"

/** A calm loading block in the tint colour. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-xl bg-tint", className)}
      {...props}
    />
  )
}

export { Skeleton }
