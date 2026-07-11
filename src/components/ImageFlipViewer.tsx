"use client"

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react"
import { createPortal } from "react-dom"
import { X, Maximize2 } from "lucide-react"

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

type Phase = "closed" | "opening" | "open" | "closing"

interface ImageFlipViewerProps {
  /** Image source, shared between the inline trigger and the floating clone. */
  src: string
  alt: string
  /** Classes for the clickable trigger container (sizing/aspect-ratio/radius in normal layout flow). */
  wrapperClassName?: string
  /** Classes applied to both the inline <img> and the floating clone (e.g. object-fit, radius). */
  imgClassName?: string
  expandLabel?: string
  closeLabel?: string
}

// Keep in sync with the --dur-expand / --ease-expand tokens in global.css.
const DURATION_MS = 460
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
// The expanded cover targets ~70-80% of the viewport height, and never exceeds
// ~92% of the viewport width, so it always fits without cropping on any screen size.
const HEIGHT_RATIO = 0.76
const WIDTH_RATIO = 0.92

function readRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function computeTarget(rect: Rect) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const scale = Math.min(
    (vh * HEIGHT_RATIO) / rect.height,
    (vw * WIDTH_RATIO) / rect.width
  )
  const width = rect.width * scale
  const height = rect.height * scale
  return {
    x: (vw - width) / 2,
    y: (vh - height) / 2,
    scale,
  }
}

export default function ImageFlipViewer({
  src,
  alt,
  wrapperClassName = "",
  imgClassName = "",
  expandLabel = "Expand cover",
  closeLabel = "Close",
}: ImageFlipViewerProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const [phase, setPhase] = useState<Phase>("closed")
  const [rect, setRect] = useState<Rect | null>(null)
  const [target, setTarget] = useState({ x: 0, y: 0, scale: 1 })

  const isOpen = phase !== "closed"

  const open = useCallback(() => {
    const el = triggerRef.current
    if (!el || phase !== "closed") return
    const startRect = readRect(el)
    if (startRect.width === 0 || startRect.height === 0) return
    restoreFocusRef.current = document.activeElement as HTMLElement
    setRect(startRect)
    setTarget(computeTarget(startRect))
    document.documentElement.style.overflow = "hidden"
    setPhase("opening")
  }, [phase])

  const close = useCallback(() => {
    // Allowing "opening" here too means a close triggered mid-flight smoothly
    // retargets the in-progress CSS transition instead of waiting it out.
    setPhase((p) => (p === "open" || p === "opening" ? "closing" : p))
  }, [])

  // FLIP technique: mount/paint the floating clone at the exact original position
  // first (no transition), then — on the following frame — switch to the target
  // transform so the browser animates between the two states.
  useLayoutEffect(() => {
    if (phase !== "opening") return
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("open"))
    })
    return () => cancelAnimationFrame(raf1)
  }, [phase])

  // Move focus into the viewer once it has fully expanded.
  useEffect(() => {
    if (phase === "open") closeButtonRef.current?.focus({ preventScroll: true })
  }, [phase])

  // Esc closes the viewer.
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isOpen, close])

  // Keep the expanded cover centered/sized correctly if the viewport is resized
  // (e.g. orientation change) while the viewer is open.
  useEffect(() => {
    if (phase !== "open") return
    const handleResize = () => {
      const el = triggerRef.current
      if (!el) return
      const r = readRect(el)
      if (r.width === 0 || r.height === 0) return
      setRect(r)
      setTarget(computeTarget(r))
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [phase])

  // Safety net: always release the scroll lock if the component unmounts mid-animation.
  useEffect(
    () => () => {
      document.documentElement.style.overflow = ""
    },
    []
  )

  const handleCloneTransitionEnd = useCallback(
    (e: ReactTransitionEvent<HTMLImageElement>) => {
      if (e.propertyName !== "transform") return
      if (phase === "closing") {
        setPhase("closed")
        document.documentElement.style.overflow = ""
        restoreFocusRef.current?.focus?.({ preventScroll: true })
      }
    },
    [phase]
  )

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      open()
    }
  }

  const cloneTransform = rect
    ? phase === "open"
      ? `translate(${target.x}px, ${target.y}px) scale(${target.scale})`
      : `translate(${rect.left}px, ${rect.top}px) scale(1)`
    : undefined

  return (
    <>
      {/* Original cover — stays in the normal page layout, hidden (but space-preserving)
          while the floating clone is on screen, so nothing ever duplicates or flashes. */}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={isOpen ? -1 : 0}
        aria-label={expandLabel}
        aria-hidden={isOpen}
        onClick={open}
        onKeyDown={handleTriggerKeyDown}
        className={`group/cover relative cursor-pointer outline-none ${wrapperClassName}`}
        style={{ visibility: isOpen ? "hidden" : "visible" }}
      >
        <img src={src} alt={alt} className={imgClassName} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover/cover:bg-black/30 group-focus-visible/cover:bg-black/30">
          <div className="flex size-9 scale-90 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-all duration-300 group-hover/cover:scale-100 group-hover/cover:opacity-100 group-focus-visible/cover:scale-100 group-focus-visible/cover:opacity-100">
            <Maximize2 className="size-4" />
          </div>
        </div>
      </div>

      {rect &&
        phase !== "closed" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100]"
            role="dialog"
            aria-modal="true"
            aria-label={alt}
          >
            {/* Dark fade overlay — dims the rest of the page without hiding it. */}
            <div
              className="absolute inset-0 bg-black"
              style={{
                opacity: phase === "open" ? 0.86 : 0,
                transitionProperty: "opacity",
                transitionDuration: `${DURATION_MS}ms`,
                transitionTimingFunction: EASE,
              }}
              onClick={close}
              aria-hidden="true"
            />

            {/* Floating clone — GPU-accelerated: only `transform` ever animates. */}
            <img
              src={src}
              alt={alt}
              onClick={(e: ReactMouseEvent) => e.stopPropagation()}
              onTransitionEnd={handleCloneTransitionEnd}
              className={`fixed rounded-xl shadow-2xl ${imgClassName}`}
              style={{
                top: 0,
                left: 0,
                width: rect.width,
                height: rect.height,
                transformOrigin: "0 0",
                transform: cloneTransform,
                transitionProperty: "transform",
                transitionDuration: `${DURATION_MS}ms`,
                transitionTimingFunction: EASE,
                willChange: "transform",
              }}
            />

            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              aria-label={closeLabel}
              className="fixed top-4 right-4 z-[101] flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/80 active:scale-95 sm:top-6 sm:right-6"
              style={{
                opacity: phase === "open" ? 1 : 0,
                pointerEvents: phase === "open" ? "auto" : "none",
                transitionProperty: "opacity",
                transitionDuration: `${DURATION_MS}ms`,
                transitionTimingFunction: EASE,
              }}
            >
              <X className="size-5" />
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
