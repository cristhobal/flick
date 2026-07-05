"use client"

import { useEffect, useRef } from "react"

export default function ScrollIndicator() {
  const barRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const maxScroll = scrollHeight - clientHeight
      const progress = maxScroll > 0 ? scrollTop / maxScroll : 0
      bar.style.transform = `scaleX(${progress})`
      bar.style.opacity = progress > 0 ? "1" : "0"
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        bar.style.opacity = "0"
      }, 1000)
    }

    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update, { passive: true })
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="fixed top-0 left-0 z-[999] h-0.5 w-full pointer-events-none">
      <div
        ref={barRef}
        className="h-full origin-left transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(255,255,255,0.25)",
          transform: "scaleX(0)",
          opacity: 0,
        }}
      />
    </div>
  )
}
