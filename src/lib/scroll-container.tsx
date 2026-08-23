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
import { createContext, useContext, useState, type ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

const ScrollViewportContext = createContext<HTMLDivElement | null>(null)

/** The element that actually scrolls — null until the ScrollArea has mounted. */
export function useScrollViewport(): HTMLDivElement | null {
  return useContext(ScrollViewportContext)
}

export function ScrollViewportProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)

  return (
    <ScrollArea className="h-dvh w-full" viewportClassName="[&>div]:!block" viewportRef={setViewport}>
      <ScrollViewportContext.Provider value={viewport}>
        {children}
      </ScrollViewportContext.Provider>
    </ScrollArea>
  )
}
