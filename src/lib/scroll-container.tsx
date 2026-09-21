"use client"

// The app's main scroll now happens inside a Radix ScrollArea (see
// ScrollViewportProvider below) instead of natively on `window`/`document` —
// that's what lets the loading screen block scrolling without ever touching a
// native scrollbar, which is what caused the layout shift this replaces (native
// overflow:hidden removes the scrollbar and shifts content by its width; the
// ScrollArea's custom thumb never affects layout either way).
//
// Anything that used to read `window.scrollY`/`document.documentElement.scrollTop`
// or call `window.scrollTo(...)` needs the actual scrolling element instead —
// that's what useScrollViewport() provides.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

const ScrollViewportContext = createContext<HTMLDivElement | null>(null)

/** The element that actually scrolls — null until the ScrollArea has mounted. */
export function useScrollViewport(): HTMLDivElement | null {
  return useContext(ScrollViewportContext)
}

/**
 * Mirrors the modal scroll lock onto the element that actually scrolls.
 *
 * Radix dialogs and sheets lock scrolling through react-remove-scroll, which targets
 * `<body>` — in this app that element scrolls nothing, so opening a sheet left the page
 * behind it free to move while `<body>` absorbed overflow/position overrides meant for a
 * scroller (those are neutralised in global.css). react-remove-scroll does flag `<body>`
 * with `data-scroll-locked` for as long as any modal layer is open, so watch that flag
 * and freeze the viewport alongside it. Counting nested layers is already handled: the
 * attribute is refcounted and only removed when the last one closes.
 */
function useMirroredScrollLock(viewport: HTMLDivElement | null) {
  useEffect(() => {
    if (!viewport) return
    const sync = () =>
      viewport.classList.toggle(
        "scroll-locked",
        document.body.hasAttribute("data-scroll-locked")
      )
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] })
    return () => {
      observer.disconnect()
      viewport.classList.remove("scroll-locked")
    }
  }, [viewport])
}

export function ScrollViewportProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  useMirroredScrollLock(viewport)

  return (
    <ScrollArea className="h-dvh w-full" viewportClassName="[&>div]:!block" viewportRef={setViewport}>
      <ScrollViewportContext.Provider value={viewport}>
        {children}
      </ScrollViewportContext.Provider>
    </ScrollArea>
  )
}
