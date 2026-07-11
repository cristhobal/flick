"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { XIcon } from "lucide-react"

interface PosterLightboxProps {
  src: string
  alt: string
  children: React.ReactNode
}

export default function PosterLightbox({ src, alt, children }: PosterLightboxProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cloneRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [initialRect, setInitialRect] = useState<DOMRect | null>(null)
  const [open, setOpen] = useState(false)
  const [exiting, setExiting] = useState(false)

  const handleOpen = useCallback(() => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    setInitialRect(rect)
    setExiting(false)
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open || exiting) return

    const raf = requestAnimationFrame(() => {
      if (!initialRect || !cloneRef.current || !overlayRef.current) return

      const rect = initialRect
      const windowW = window.innerWidth
      const windowH = window.innerHeight

      const scaleX = (windowW * 0.9) / rect.width
      const scaleY = (windowH * 0.75) / rect.height
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
    })

    return () => cancelAnimationFrame(raf)
  }, [open, exiting, initialRect])

  const handleClose = useCallback(() => {
    if (exiting) return
    setExiting(true)

    if (cloneRef.current) {
      cloneRef.current.style.transform = "translate(0, 0) scale(1)"
      cloneRef.current.style.borderRadius = "0.75rem"
    }
    if (overlayRef.current) {
      overlayRef.current.style.opacity = "0"
    }
  }, [exiting])

  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.propertyName === "transform" && exiting) {
      setOpen(false)
    }
  }, [exiting])

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

  useEffect(() => {
    if (!open) return
    const handleOverlayClick = () => handleClose()
    const overlay = overlayRef.current
    overlay?.addEventListener("click", handleOverlayClick)
    return () => overlay?.removeEventListener("click", handleOverlayClick)
  }, [open, handleClose])

  return (
    <>
      <div
        ref={wrapperRef}
        onClick={handleOpen}
        className="cursor-pointer"
        style={{ visibility: open ? "hidden" : "visible" }}
      >
        {children}
      </div>
      {open && initialRect &&
        createPortal(
          <>
            <div
              ref={overlayRef}
              className="fixed inset-0 z-50 cursor-pointer bg-black/80 backdrop-blur-sm transition-opacity duration-[450ms]"
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
                borderRadius: "0.75rem",
                willChange: "transform",
                transitionTimingFunction: "cubic-bezier(.22,1,.36,1)",
                transform: "translate(0, 0) scale(1)",
              }}
            >
              <img
                src={src}
                alt={alt}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
            {!exiting && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose()
                }}
                className="fixed top-4 right-4 z-[60] flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                style={{
                  animation: "fade-in 220ms cubic-bezier(0,0,0.2,1) 300ms both",
                }}
                aria-label="Close poster viewer"
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
