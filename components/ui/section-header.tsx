import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * A section's title row: a small tinted icon tile in the section colour, the title,
 * an optional intro line and an optional action on the right. The h2 gets `${id}-title`,
 * so the section can be labelled by it.
 */
function SectionHeader({
  id,
  title,
  intro,
  icon: Icon,
  tone = "text-brand",
  action,
  className,
}: {
  id: string
  title: string
  intro?: ReactNode
  icon?: LucideIcon
  /** Text colour class for the icon, e.g. `text-section-drink`. */
  tone?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="flex items-center gap-3 text-title">
          {Icon && (
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-tint"
              aria-hidden
            >
              <Icon className={cn("size-[18px]", tone)} />
            </span>
          )}
          {title}
        </h2>
        {action}
      </div>
      {intro && <p className="max-w-reading text-ink-muted">{intro}</p>}
    </div>
  )
}

export { SectionHeader }
