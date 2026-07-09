"use client"

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Play, Star } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { translateGenre } from "@/i18n/translations"
import {
  posterUrl,
  backdropUrl,
  getGenreGradient,
  isPlayableMovie,
} from "@/lib/data"

const PREVIEW_OPEN_EVENT = "flick:movie-preview-open"

interface EpisodeCardProps {
  episode: Movie
  movie: Movie
  onPlay?: (episode: Movie) => void
  onClick?: (episode: Movie) => void
  index?: number
}

export default function EpisodeCard({
  episode,
  movie,
  onPlay,
  onClick,
  index = 0,
}: EpisodeCardProps) {
  const [showExpanded, setShowExpanded] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [expandUpward, setExpandUpward] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cardRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewIdRef = useRef(`episode-preview-${episode.id}-${index}`)
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

  useEffect(() => {
    if (!showExpanded) return
    const handleScroll = () => {
      cancelHide()
      setShowExpanded(false)
    }
    window.addEventListener("scroll", handleScroll, { once: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [showExpanded, cancelHide])

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
  }, [])

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
  }, [showExpanded, calculatePosition])

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

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = event.currentTarget as HTMLElement
    const px = el.dataset.pointerX
    const py = el.dataset.pointerY
    if (px && py && (Math.abs(event.clientX - Number(px)) > 4 || Math.abs(event.clientY - Number(py)) > 4)) {
      return
    }
    const sel = window.getSelection?.()
    if (sel && sel.toString().length > 0 && el.contains(sel.anchorNode)) {
      return
    }
    onClick?.(episode)
  }

  const episodeName = episode.episodeTitle || episode.title || ""
  const episodeLabel = episode.episodeNumber
    ? `E${episode.episodeNumber} - ${episodeName}`
    : episodeName

  const imgSrc = posterUrl(episode.posterPath || movie.posterPath, "w185")
  const bgSrc = backdropUrl(episode.backdropPath || movie.backdropPath, "w780")
  const canPlay = isPlayableMovie(episode)
  const synopsis = episode.episodeSynopsis || episode.description || ""
  const duration = episode.duration && episode.duration !== "-"
    ? episode.duration
    : t("common.noAvailable")
  const hasRating = typeof episode.rating === "number" && episode.rating > 0

  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={handleCardEnter}
        onMouseLeave={handleCardLeave}
      >
        <div
          className="cursor-pointer rounded-lg border border-neutral-800 bg-neutral-900/50 transition-colors hover:border-neutral-700 hover:bg-neutral-900 h-[136px] overflow-hidden"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).dataset.pointerX = String(e.clientX)
            ;(e.currentTarget as HTMLElement).dataset.pointerY = String(e.clientY)
          }}
          onClick={handleCardClick}
        >
          <div className="flex gap-3 p-3 items-start">
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-neutral-800 shadow-md">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={episodeLabel}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className={`h-full w-full bg-gradient-to-b ${getGenreGradient(movie.genre)}`} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm leading-snug font-medium text-white">
                    {episodeLabel}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {duration}
                  </p>
                </div>
                {canPlay && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onPlay?.(episode)
                    }}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
                  >
                    <Play className="size-3.5 fill-black" />
                  </button>
                )}
              </div>
              {synopsis && (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-neutral-400">
                  {synopsis}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showExpanded && createPortal(
        <article
          ref={previewRef}
          className="pointer-events-none fixed z-[9999] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.75)] animate-scale-in"
          style={{ left: pos.left, ...(expandUpward ? { bottom: pos.top } : { top: pos.top }) }}
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-900">
            {bgSrc ? (
              <img src={bgSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${getGenreGradient(movie.genre)}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-black/20 to-black/10" />

            <div className="absolute top-3 right-3 flex items-center gap-2">
              {episode.quality && (
                <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
                  {episode.quality}
                </span>
              )}
            </div>

            <div
              className="pointer-events-auto absolute right-4 bottom-4 left-4"
              onMouseEnter={handlePreviewInteractiveEnter}
              onMouseLeave={handlePreviewInteractiveLeave}
            >
              <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-white drop-shadow-lg">
                {episodeLabel}
              </h3>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-300">
                <span>{episode.seriesTitle || movie.title}</span>
                <span className="size-1 rounded-full bg-neutral-500" />
                <span>{duration}</span>
              </div>
            </div>
          </div>

          <div
            className="pointer-events-auto p-4"
            onMouseEnter={handlePreviewInteractiveEnter}
            onMouseLeave={handlePreviewInteractiveLeave}
          >
            <div className="flex items-center gap-2">
              {canPlay && (
                <Button
                  size="sm"
                  className="h-9 flex-1 rounded-lg bg-white text-xs font-semibold text-black hover:bg-neutral-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPlay?.(episode)
                  }}
                >
                  <Play className="size-4 fill-black" />
                  {t("common.play")}
                </Button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-neutral-400">
              {hasRating && (
                <span className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-medium text-amber-400">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {episode.rating}
                </span>
              )}
              <span className="rounded border border-white/10 px-2 py-1">
                {duration}
              </span>
              {episode.seasonNumber && (
                <span className="rounded border border-white/10 px-2 py-1">
                  S{episode.seasonNumber}
                </span>
              )}
              {episode.episodeNumber && (
                <span className="rounded border border-white/10 px-2 py-1">
                  E{episode.episodeNumber}
                </span>
              )}
              {episode.contentRating && (
                <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-medium text-neutral-200">
                  {episode.contentRating}
                </span>
              )}
            </div>

            {synopsis && (
              <div className="pt-3">
                <p className="text-xs leading-relaxed text-neutral-400">
                  {synopsis}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-3">
              {movie.genre.split(",").map((genre) => genre.trim()).filter(Boolean).slice(0, 4).map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-neutral-400 ring-1 ring-inset ring-white/5"
                >
                  {translateGenre(genre, lang)}
                </span>
              ))}
            </div>
          </div>
        </article>,
        document.body
      )}
    </>
  )
}
