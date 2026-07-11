"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { XIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { IMG_URL } from "@/lib/tmdb"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
  type CarouselApi,
} from "@/components/ui/carousel"

interface ScreenshotLightboxProps {
  screenshots: string[]
  initialIndex: number
  children: React.ReactNode
}

interface FinalRect {
  left: number
  top: number
  width: number
  height: number
}

// Renders the arrows + counter through a portal to <body>, positioned with
// `fixed` coordinates derived from the real on-screen rect. This is
// necessary because the carousel lives inside a container that is scaled
// up with CSS `transform: scale()` (the open/close FLIP animation) rather
// than resized — if these controls stayed inside that container, their
// true pixel size would get multiplied by that same scale factor and
// render far bigger than their classes say, no matter how "small" the
// Tailwind sizes look in the code.
function CarouselNav({ total, rect }: { total: number; rect: FinalRect | null }) {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext, api } = useCarousel()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!api) return
    const cb = () => setIndex(api.selectedScrollSnap())
    api.on("select", cb)
    cb()
    return () => { api?.off("select", cb) }
  }, [api])

  if (!rect) return null

  const BTN = 36 // px, matches size-9

  return createPortal(
    <>
      {canScrollPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); scrollPrev() }}
          className="fixed z-[55] flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/40 text-neutral-200 backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/60 hover:text-white active:scale-95"
          style={{
            left: rect.left + 8,
            top: rect.top + rect.height / 2,
            animation: "fade-in 220ms cubic-bezier(0,0,0.2,1) 300ms both",
          }}
          aria-label="Previous screenshot"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {canScrollNext && (
        <button
          onClick={(e) => { e.stopPropagation(); scrollNext() }}
          className="fixed z-[55] flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/40 text-neutral-200 backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/60 hover:text-white active:scale-95"
          style={{
            left: rect.left + rect.width - 8 - BTN,
            top: rect.top + rect.height / 2,
            animation: "fade-in 220ms cubic-bezier(0,0,0.2,1) 300ms both",
          }}
          aria-label="Next screenshot"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
      <div
        className="fixed z-[55] -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs leading-none text-white backdrop-blur-sm pointer-events-none"
        style={{
          left: rect.left + rect.width / 2,
          top: rect.top + rect.height - 28,
          animation: "fade-in 220ms cubic-bezier(0,0,0.2,1) 300ms both",
        }}
      >
        {index + 1} / {total}
      </div>
    </>,
    document.body
  )
}

export default function ScreenshotLightbox({
  screenshots,
  initialIndex,
  children,
}: ScreenshotLightboxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cloneRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const initialRectRef = useRef<DOMRect | null>(null)
  const carouselApiRef = useRef<CarouselApi | null>(null)
  const [initialRect, setInitialRect] = useState<DOMRect | null>(null)
  const [finalRect, setFinalRect] = useState<FinalRect | null>(null)
  const [open, setOpen] = useState(false)
  const [exiting, setExiting] = useState(false)

  // ── Open ──────────────────────────────────────────────────────

  const handleOpen = useCallback(() => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    initialRectRef.current = rect
    setInitialRect(rect)
    setExiting(false)
    setOpen(true)
  }, [])

  // ── Enter animation ───────────────────────────────────────────

  useEffect(() => {
    if (!open || exiting) return

    const raf = requestAnimationFrame(() => {
      const rect = initialRectRef.current
      if (!rect || !cloneRef.current || !overlayRef.current) return

      const windowW = window.innerWidth
      const windowH = window.innerHeight

      const scaleX = (windowW * 0.92) / rect.width
      const scaleY = (windowH * 0.85) / rect.height
      const targetScale = Math.min(scaleX, scaleY)

      const targetCenterX = windowW / 2
      const targetCenterY = windowH / 2
      const currentCenterX = rect.left + rect.width / 2
      const currentCenterY = rect.top + rect.height / 2

      const translateX = targetCenterX - currentCenterX
      const translateY = targetCenterY - currentCenterY

      cloneRef.current.style.transform = `translate(${translateX}px, ${translateY}px) scale(${targetScale})`
      cloneRef.current.style.borderRadius = "0"
      overlayRef.current.style.opacity = "1"

      // Real on-screen size/position once expanded — used to place the
      // nav controls outside the scaled container (see CarouselNav).
      const finalWidth = rect.width * targetScale
      const finalHeight = rect.height * targetScale
      setFinalRect({
        left: targetCenterX - finalWidth / 2,
        top: targetCenterY - finalHeight / 2,
        width: finalWidth,
        height: finalHeight,
      })
    })

    return () => cancelAnimationFrame(raf)
  }, [open, exiting])

  // ── Preload images ────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    screenshots.forEach((p) => {
      const img = new Image()
      img.src = `${IMG_URL}/original${p}`
    })
  }, [open, screenshots])

  // ── Close ─────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (exiting) return
    setExiting(true)
    setFinalRect(null)

    const startRect = initialRectRef.current

    if (cloneRef.current && startRect) {
      // Close back onto whichever screenshot is currently being viewed —
      // not necessarily the one that was originally clicked to open this.
      const currentIndex = carouselApiRef.current?.selectedScrollSnap() ?? initialIndex
      const targetEl = document.querySelector<HTMLElement>(
        `[data-screenshot-index="${currentIndex}"]`
      )
      const targetRect = targetEl?.getBoundingClientRect() ?? startRect

      const scaleX = targetRect.width / startRect.width
      const scaleY = targetRect.height / startRect.height

      const translateX =
        targetRect.left + targetRect.width / 2 - (startRect.left + startRect.width / 2)
      const translateY =
        targetRect.top + targetRect.height / 2 - (startRect.top + startRect.height / 2)

      cloneRef.current.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`
      cloneRef.current.style.borderRadius = "0.5rem"
    }
    if (overlayRef.current) {
      overlayRef.current.style.opacity = "0"
    }
  }, [exiting, initialIndex])

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.propertyName === "transform" && exiting) {
        setOpen(false)
      }
    },
    [exiting]
  )

  // ── Keyboard (Escape only — arrows handled by Carousel) ────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    },
    [handleClose]
  )

  useEffect(() => {
    if (!open) return

    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      html.style.overflow = prev
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, handleKeyDown])

  // ── Overlay click ─────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const overlay = overlayRef.current
    const cb = () => handleClose()
    overlay?.addEventListener("click", cb)
    return () => overlay?.removeEventListener("click", cb)
  }, [open, handleClose])

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={wrapperRef}
        onClick={handleOpen}
        className="cursor-pointer"
        data-screenshot-index={initialIndex}
      >
        {children}
      </div>
      {open && initialRect &&
        createPortal(
          <>
            <div
              ref={overlayRef}
              className="fixed inset-0 z-50 cursor-pointer bg-black/85 backdrop-blur-sm transition-opacity duration-[450ms]"
              style={{
                opacity: 0,
                transitionTimingFunction: "cubic-bezier(.22,1,.36,1)",
              }}
            />
            <div
              ref={cloneRef}
              onTransitionEnd={handleTransitionEnd}
              className="fixed z-50 overflow-hidden shadow-2xl transition-all duration-[450ms]"
              style={{
                left: initialRect.left,
                top: initialRect.top,
                width: initialRect.width,
                height: initialRect.height,
                borderRadius: "0.5rem",
                willChange: "transform",
                transitionTimingFunction: "cubic-bezier(.22,1,.36,1)",
                transform: "translate(0, 0) scale(1)",
              }}
            >
              <Carousel
                opts={{ startIndex: initialIndex, loop: false, align: "start" }}
                setApi={(api) => { carouselApiRef.current = api }}
                className="h-full w-full"
              >
                <CarouselContent className="-ml-0 h-full">
                  {screenshots.map((p, i) => (
                    <CarouselItem key={p} className="flex h-full items-center justify-center pl-0">
                      <img
                        src={`${IMG_URL}/original${p}`}
                        alt={`Screenshot ${i + 1}`}
                        className="h-full w-full object-contain"
                        draggable={false}
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {!exiting && <CarouselNav total={screenshots.length} rect={finalRect} />}
              </Carousel>
            </div>
            {!exiting && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose()
                }}
                className="fixed top-3 right-3 z-[60] flex size-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                style={{
                  animation: "fade-in 220ms cubic-bezier(0,0,0.2,1) 300ms both",
                }}
                aria-label="Close screenshots viewer"
              >
                <XIcon className="size-5" />
              </button>
            )}
          </>,
          document.body
        )}
    </>
  )
}
