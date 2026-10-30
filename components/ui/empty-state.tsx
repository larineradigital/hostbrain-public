import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"

/** A friendly empty, error or "not yet" state: icon, one line of title, one of help, an action. */
function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
  role,
}: {
  icon?: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
  role?: "status" | "alert"
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center",
        className
      )}
    >
      {Icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-tint" aria-hidden>
          <Icon className="size-6 text-ink-muted" />
        </span>
      )}
      <p className="font-semibold">{title}</p>
      {body && <div className="max-w-sm text-sm text-ink-muted">{body}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

export { EmptyState }
