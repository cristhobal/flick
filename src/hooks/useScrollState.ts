import { useState, useEffect, useCallback, type RefObject } from "react"

// Tracks whether a horizontally scrolling row can scroll left/right.
//
// `ref` MUST keep the same identity between renders. React detaches a changed ref
// (calls the old one with null) and re-attaches the new one on every commit, and
// this ref's job is a setState — so an inline `ref={(node) => ...}` wrapper turns
// each render into two state updates, which re-render, which build another inline
// ref… until React aborts with "Maximum update depth exceeded". Pass the ref object
// the caller also needs (for scrollBy, etc.) as `targetRef` and it is kept in sync
// from inside this one stable callback instead of composing refs at the call site.
export function useScrollState(targetRef?: RefObject<HTMLDivElement | null>) {
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
    if (targetRef) targetRef.current = node
    setEl(node)
  }, [targetRef])

  return { canScrollLeft, canScrollRight, ref }
}
