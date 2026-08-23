"use client"

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { Star, Calendar, MapPin, VenusAndMars, Film } from "lucide-react"
import type { TMDbCast, TMDbPerson } from "@/lib/tmdb"
import { fetchPersonDetails } from "@/lib/tmdb"
import { IMG_URL } from "@/lib/tmdb"
import { useI18n } from "@/i18n/I18nProvider"
import { useScrollViewport } from "@/lib/scroll-container"

const PREVIEW_OPEN_EVENT = "flick:movie-preview-open"

interface CastCardProps {
  actor: TMDbCast
  index?: number
}

export default function CastCard({ actor, index = 0 }: CastCardProps) {
  const [showExpanded, setShowExpanded] = useState(false)
  const [person, setPerson] = useState<TMDbPerson | null>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [expandUpward, setExpandUpward] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cardRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewIdRef = useRef(`cast-preview-${actor.id}-${index}`)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const { lang, t } = useI18n()

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimerRef.current)
  }, [])

  useEffect(() => {
    const closeOtherPreview = (event: Event) => {
      const previewId = (event as CustomEvent<string>).detail
      if (previewId === previewIdRef.current) return
      clearTimeout(showTimerRef.current)
      clearTimeout(hideTimerRef.current)
      setShowExpanded(false)
    }
    window.addEventListener(PREVIEW_OPEN_EVENT, closeOtherPreview)
    return () => {
      window.removeEventListener(PREVIEW_OPEN_EVENT, closeOtherPreview)
      clearTimeout(showTimerRef.current)
      clearTimeout(hideTimerRef.current)
    }
  }, [])

  const scrollViewport = useScrollViewport()
  useEffect(() => {
    if (!showExpanded || !scrollViewport) return
    const handleScroll = () => {
      cancelHide()
      setShowExpanded(false)
    }
    scrollViewport.addEventListener("scroll", handleScroll, { once: true })
    return () => scrollViewport.removeEventListener("scroll", handleScroll)
  }, [showExpanded, cancelHide, scrollViewport])

  useEffect(() => {
    if (!showExpanded || person !== null) return
    let cancelled = false
    fetchPersonDetails(actor.id, lang).then((result) => {
      if (!cancelled) setPerson(result)
    })
    return () => { cancelled = true }
  }, [showExpanded, actor.id, person])

  const calculatePosition = useCallback(() => {
    if (!cardRef.current || !previewRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const previewEl = previewRef.current
    const actualPreviewHeight = previewEl.offsetHeight
    const actualPreviewWidth = previewEl.offsetWidth
    const viewportPadding = 12
    const gap = 8
    const spaceRight = window.innerWidth - rect.right
    const rawLeft = spaceRight >= actualPreviewWidth + gap + viewportPadding
      ? rect.right + gap
      : rect.left - actualPreviewWidth - gap
    const left = Math.min(
      Math.max(viewportPadding, rawLeft),
      window.innerWidth - actualPreviewWidth - viewportPadding
    )
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const canExpandDown = spaceBelow >= actualPreviewHeight + gap + viewportPadding
    const canExpandUp = spaceAbove >= actualPreviewHeight + gap + viewportPadding
    const shouldExpandUp = (!canExpandDown && canExpandUp) || (!canExpandDown && !canExpandUp && spaceAbove >= spaceBelow)
    setExpandUpward(shouldExpandUp)
    if (shouldExpandUp) {
      const bottom = Math.min(
        Math.max(window.innerHeight - rect.bottom - gap, viewportPadding),
        window.innerHeight - actualPreviewHeight - viewportPadding
      )
      setPos({ left, top: bottom })
    } else {
      const top = Math.min(
        Math.max(rect.top, viewportPadding),
        window.innerHeight - actualPreviewHeight - viewportPadding
      )
      setPos({ left, top })
    }
  }, [person])

  useLayoutEffect(() => {
    if (showExpanded && previewRef.current) {
      calculatePosition()

      resizeObserverRef.current?.disconnect()
      const observer = new ResizeObserver(() => {
        calculatePosition()
      })
      observer.observe(previewRef.current)
      resizeObserverRef.current = observer
    }
    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
    }
  }, [showExpanded, person, calculatePosition])

  const scheduleHide = useCallback((delay = 350) => {
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setShowExpanded(false)
    }, delay)
  }, [])

  const handleCardEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia("(hover: none)").matches) return
    clearTimeout(hideTimerRef.current)
    window.dispatchEvent(
      new CustomEvent<string>(PREVIEW_OPEN_EVENT, { detail: previewIdRef.current })
    )
    if (showExpanded || showTimerRef.current) return
    showTimerRef.current = setTimeout(() => {
      showTimerRef.current = undefined
      if (!cardRef.current) return
      const rect = cardRef.current.getBoundingClientRect()
      const previewWidth = Math.min(360, window.innerWidth - 24)
      const previewHeight = Math.min(460, window.innerHeight - 24)
      const viewportPadding = 12
      const gap = 8
      const spaceRight = window.innerWidth - rect.right
      const rawLeft = spaceRight >= previewWidth + gap + viewportPadding
        ? rect.right + gap
        : rect.left - previewWidth - gap
      const left = Math.min(
        Math.max(viewportPadding, rawLeft),
        window.innerWidth - previewWidth - viewportPadding
      )
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      const canExpandDown = spaceBelow >= previewHeight + gap + viewportPadding
      const canExpandUp = spaceAbove >= previewHeight + gap + viewportPadding
      const shouldExpandUp = (!canExpandDown && canExpandUp) || (!canExpandDown && !canExpandUp && spaceAbove >= spaceBelow)
      setExpandUpward(shouldExpandUp)
      if (shouldExpandUp) {
        const bottom = Math.min(
          Math.max(window.innerHeight - rect.bottom - gap, viewportPadding),
          window.innerHeight - previewHeight - viewportPadding
        )
        setPos({ left, top: bottom })
      } else {
        const top = Math.min(
          Math.max(rect.top, viewportPadding),
          window.innerHeight - previewHeight - viewportPadding
        )
        setPos({ left, top })
      }
      setShowExpanded(true)
    }, 120)
  }

  const handleCardLeave = () => {
    if (window.matchMedia("(hover: none)").matches) return
    clearTimeout(showTimerRef.current)
    showTimerRef.current = undefined
    scheduleHide(280)
  }

  const handlePreviewInteractiveEnter = () => {
    cancelHide()
  }

  const handlePreviewInteractiveLeave = () => {
    scheduleHide(220)
  }

  const profileSrc = actor.profile_path
    ? `${IMG_URL}/w185${actor.profile_path}`
    : null

  const genderLabel =
    person?.gender === 2 ? t("common.male") : person?.gender === 1 ? t("common.female") : ""

  const kebabName = person?.also_known_as?.length
    ? person.also_known_as[0]
    : null

  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={handleCardEnter}
        onMouseLeave={handleCardLeave}
        className="w-28 shrink-0 snap-start cursor-pointer sm:w-32"
      >
        <div className="mb-2 aspect-[2/3] overflow-hidden rounded-lg bg-neutral-800">
          {profileSrc ? (
            <img
              src={profileSrc}
              alt={actor.name}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-600">
              <Star className="size-6" />
            </div>
          )}
        </div>
        <p className="truncate text-xs font-medium text-white">{actor.name}</p>
        <p className="truncate text-[10px] text-neutral-500">{actor.character}</p>
      </div>

      {showExpanded && createPortal(
        <article
          ref={previewRef}
          className="pointer-events-none fixed z-[9999] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.75)] animate-scale-in"
          style={{ left: pos.left, ...(expandUpward ? { bottom: pos.top } : { top: pos.top }) }}
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950">
            {profileSrc && (
              <img
                src={profileSrc}
                alt=""
                className="h-full w-full object-cover opacity-40 transition-transform duration-700 hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-black/20 to-black/10" />

            <div
              className="pointer-events-auto absolute right-4 bottom-4 left-4"
              onMouseEnter={handlePreviewInteractiveEnter}
              onMouseLeave={handlePreviewInteractiveLeave}
            >
              <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-white drop-shadow-lg">
                {actor.name}
              </h3>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-300">
                <span>{actor.character}</span>
                {person?.known_for_department && (
                  <>
                    <span className="size-1 rounded-full bg-neutral-500" />
                    <span className="flex items-center gap-1">
                      <Film className="size-3" />
                      {person.known_for_department}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            className="pointer-events-auto p-4"
            onMouseEnter={handlePreviewInteractiveEnter}
            onMouseLeave={handlePreviewInteractiveLeave}
          >
            {!person ? (
              <div className="flex items-center justify-center py-6">
                <div className="size-6 animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 text-[11px] text-neutral-400">
                  {person.birthday && (
                    <span className="flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                      <Calendar className="size-3" />
                      {person.birthday.split("-").reverse().join("-")}
                    </span>
                  )}
                  {person.place_of_birth && (
                    <span className="flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                      <MapPin className="size-3" />
                      {person.place_of_birth}
                    </span>
                  )}
                  {genderLabel && (
                    <span className="flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                      <VenusAndMars className="size-3" />
                      {genderLabel}
                    </span>
                  )}
                </div>

                {kebabName && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-neutral-400 ring-1 ring-inset ring-white/5">
                      {t("common.alsoKnownAs")}: {kebabName}
                    </span>
                  </div>
                )}

                {person.biography && (
                  <div className="mt-3">
                    <p className="line-clamp-4 text-xs leading-relaxed text-neutral-400">
                      {person.biography}
                    </p>
                  </div>
                )}

                {!person.biography && !person.birthday && !person.place_of_birth && !genderLabel && (
                  <p className="py-2 text-xs text-neutral-500">
                    {t("common.noInfo")}
                  </p>
                )}
              </>
            )}
          </div>
        </article>,
        document.body
      )}
    </>
  )
}
