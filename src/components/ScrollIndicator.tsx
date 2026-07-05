"use client"

import { useEffect, useRef, useState } from "react"

export default function ScrollIndicator() {
  const [thumbTop, setThumbTop] = useState(0)
  const [thumbHeight, setThumbHeight] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const maxScroll = scrollHeight - clientHeight
      if (maxScroll <= 0) {
        setVisible(false)
        return
      }
      const ratio = scrollTop / maxScroll
      const thumbH = Math.max(24, (clientHeight / scrollHeight) * clientHeight)
      setThumbTop(ratio * (clientHeight - thumbH))
      setThumbHeight(thumbH)
      setVisible(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 1200)
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
    <div
      className="fixed top-0 right-0 z-[999] h-full pointer-events-none"
      style={{ width: 5 }}
    >
      <div
        className="relative w-full rounded-full transition-opacity duration-300"
        style={{
          top: thumbTop,
          height: thumbHeight,
          width: 5,
          opacity: visible ? 1 : 0,
          backgroundColor: "rgba(255,255,255,0.2)",
        }}
      />
    </div>
  )
}
