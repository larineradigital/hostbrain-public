"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"

/**
 * An `<img>` that swaps to `fallback` when there is no source or it fails to load, so a
 * dead image link shows an illustration instead of a broken icon. Images come from Qloo's
 * and hosts' CDNs, so this is a plain `<img>`, not next/image.
 */
function FallbackImage({
  src,
  alt,
  width,
  height,
  className,
  fallback,
  priority = false,
}: {
  src: string | null | undefined
  alt: string
  width: number
  height: number
  className?: string
  fallback: ReactNode
  /** Likely the largest paint: load eagerly, at high priority. */
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  // An image can fail before hydration, when onError isn't attached yet.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  if (!src || failed) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images come from Qloo's and hosts' CDNs
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("bg-tint object-cover", className)}
    />
  )
}

export { FallbackImage }
