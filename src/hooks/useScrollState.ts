import { useState, useEffect, useCallback } from "react"

export function useScrollState() {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    if (!el) return

    let cancelled = false
    let frameId = 0

    const check = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        if (cancelled) return
        const { scrollLeft, scrollWidth, clientWidth } = el
        setCanScrollLeft(scrollLeft > 4)
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4)
      })
    }

    check()

    el.addEventListener("scroll", check, { passive: true })

    const mutationObserver = new MutationObserver(() => check())
    mutationObserver.observe(el, { childList: true, subtree: true })

    const resizeObserver = new ResizeObserver(() => check())
    resizeObserver.observe(el)

    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
      el.removeEventListener("scroll", check)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [el])

  const ref = useCallback((node: HTMLDivElement | null) => {
    setEl(node)
  }, [])

  return { canScrollLeft, canScrollRight, ref }
}
