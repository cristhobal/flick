"use client"

import { useEffect, useRef } from "react"

// The browser's own scrollbar can't be made to truly float transparent over
// content — Chrome/Edge paint the track's reserved gutter in its own layer
// with an opaque background no matter what `::-webkit-scrollbar` says (the
// native one is fully hidden via `scrollbar-width: none` / `width: 0` in
// global.css instead). This component is a real replacement: a slim vertical
// thumb, positioned like a native scrollbar, that lives as a normal
// semi-transparent element above the page — plus drag-to-scroll and
// click-to-jump so it behaves like one, not just looks like one.

const THUMB_MIN_HEIGHT = 32 // px — floor so the thumb stays grabbable on very long pages
const IDLE_HIDE_DELAY = 900 // ms of no scroll/hover/drag before it fades out
const LERP_FACTOR = 0.22 // 0–1 — higher follows the scroll instantly, lower trails more smoothly
const SNAP_EPSILON = 0.05 // px — how close is "close enough" to stop the animation loop

export default function ScrollIndicator() {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    track.style.pointerEvents = canHover ? "auto" : "none"

    let trackHeight = 0
    let thumbHeight = 0
    let targetY = 0
    let currentY = 0
    let visible = false
    let dragging = false
    let hovering = false
    let animating = false
    let rafId = 0
    let hideTimer: ReturnType<typeof setTimeout>

    const setVisible = (next: boolean) => {
      if (visible === next) return
      visible = next
      thumb.style.opacity = next ? "1" : "0"
    }

    const scheduleHide = () => {
      clearTimeout(hideTimer)
      if (dragging || hovering) return
      hideTimer = setTimeout(() => setVisible(false), IDLE_HIDE_DELAY)
    }

    const startLoop = () => {
      if (animating) return
      animating = true
      rafId = requestAnimationFrame(tick)
    }

    // Smoothly trails toward the real scroll position instead of snapping to
    // it, so fast or "notchy" wheel/trackpad input still reads as one fluid
    // motion. The loop stops itself once caught up, instead of running forever.
    const tick = () => {
      const factor = prefersReducedMotion ? 1 : LERP_FACTOR
      currentY += (targetY - currentY) * factor
      if (Math.abs(targetY - currentY) < SNAP_EPSILON) {
        currentY = targetY
        thumb.style.transform = `translateY(${currentY}px)`
        animating = false
        return
      }
      thumb.style.transform = `translateY(${currentY}px)`
      rafId = requestAnimationFrame(tick)
    }

    const measure = () => {
      const { scrollHeight, clientHeight } = document.documentElement
      trackHeight = window.innerHeight
      const ratio = clientHeight / Math.max(scrollHeight, 1)
      thumbHeight = Math.max(THUMB_MIN_HEIGHT, Math.round(trackHeight * ratio))
      thumb.style.height = `${thumbHeight}px`
      computeTarget()
    }

    const computeTarget = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const maxScroll = scrollHeight - clientHeight
      const range = trackHeight - thumbHeight
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0
      targetY = range > 0 ? progress * range : 0
      // Nothing to scroll (short page) → there's nothing to indicate
      track.style.display = maxScroll > 4 ? "block" : "none"
    }

    const onScroll = () => {
      computeTarget()
      startLoop()
      setVisible(true)
      scheduleHide()
    }

    const onResize = () => measure()

    measure()
    if (prefersReducedMotion) {
      thumb.style.transform = `translateY(${targetY}px)`
      currentY = targetY
    } else {
      startLoop()
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)

    // SPA route/content changes can resize the page without a window resize
    // (route swap, images loading in, a filter panel expanding, etc.)
    const resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(document.body)

    // Hide while a modal/sheet has scroll-locked the body — nothing to
    // reflect while the page underneath can't move.
    const bodyObserver = new MutationObserver(() => {
      const locked = document.body.hasAttribute("data-scroll-locked")
      track.style.visibility = locked ? "hidden" : "visible"
    })
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] })

    let onPointerEnter: (() => void) | undefined
    let onPointerLeave: (() => void) | undefined
    let onThumbPointerDown: ((e: PointerEvent) => void) | undefined
    let onTrackPointerDown: ((e: PointerEvent) => void) | undefined

    if (canHover) {
      onPointerEnter = () => {
        hovering = true
        clearTimeout(hideTimer)
        setVisible(true)
      }
      onPointerLeave = () => {
        hovering = false
        scheduleHide()
      }

      onThumbPointerDown = (e: PointerEvent) => {
        e.preventDefault()
        dragging = true
        animating = false
        thumb.classList.add("is-active")
        thumb.setPointerCapture(e.pointerId)
        setVisible(true)

        const startClientY = e.clientY
        const startScrollTop = document.documentElement.scrollTop
        const { scrollHeight, clientHeight } = document.documentElement
        const maxScroll = scrollHeight - clientHeight
        const range = trackHeight - thumbHeight

        const onPointerMove = (moveEvent: PointerEvent) => {
          const deltaY = moveEvent.clientY - startClientY
          const scrollDelta = range > 0 ? (deltaY / range) * maxScroll : 0
          const nextTop = Math.min(maxScroll, Math.max(0, startScrollTop + scrollDelta))
          window.scrollTo({ top: nextTop })
          // Position the thumb directly under the pointer right away — the
          // 'scroll' event this triggers is async, and waiting for it (plus
          // the lerp loop) would make the thumb visibly trail the cursor.
          const progress = maxScroll > 0 ? nextTop / maxScroll : 0
          targetY = range > 0 ? progress * range : 0
          currentY = targetY
          thumb.style.transform = `translateY(${currentY}px)`
        }
        const onPointerUp = () => {
          dragging = false
          thumb.classList.remove("is-active")
          scheduleHide()
          window.removeEventListener("pointermove", onPointerMove)
          window.removeEventListener("pointerup", onPointerUp)
        }
        window.addEventListener("pointermove", onPointerMove)
        window.addEventListener("pointerup", onPointerUp)
      }

      // Clicking the (invisible) gutter jumps to that position, like clicking
      // the track of a native scrollbar.
      onTrackPointerDown = (e: PointerEvent) => {
        if (e.target !== track) return
        const rect = track.getBoundingClientRect()
        const range = trackHeight - thumbHeight
        const { scrollHeight, clientHeight } = document.documentElement
        const maxScroll = scrollHeight - clientHeight
        const clickY = e.clientY - rect.top - thumbHeight / 2
        const progress = range > 0 ? Math.min(1, Math.max(0, clickY / range)) : 0
        window.scrollTo({ top: progress * maxScroll, behavior: "smooth" })
      }

      thumb.addEventListener("pointerenter", onPointerEnter)
      thumb.addEventListener("pointerleave", onPointerLeave)
      thumb.addEventListener("pointerdown", onThumbPointerDown)
      track.addEventListener("pointerdown", onTrackPointerDown)
    }

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(hideTimer)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      resizeObserver.disconnect()
      bodyObserver.disconnect()
      if (canHover) {
        thumb.removeEventListener("pointerenter", onPointerEnter!)
        thumb.removeEventListener("pointerleave", onPointerLeave!)
        thumb.removeEventListener("pointerdown", onThumbPointerDown!)
        track.removeEventListener("pointerdown", onTrackPointerDown!)
      }
    }
  }, [])

  return (
    <div
      ref={trackRef}
      className="fixed top-0 right-0 z-[999] h-screen w-4"
      aria-hidden="true"
    >
      <div
        ref={thumbRef}
        className="flick-scroll-thumb absolute top-0 right-1 w-1.5 cursor-grab rounded-full opacity-0 transition-[opacity,background-color] duration-300 ease-out active:cursor-grabbing"
        style={{ willChange: "transform" }}
      />
    </div>
  )
}
