"use client"

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Play, ChevronDown, Star } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { translateGenre } from "@/i18n/translations"
import {
  posterUrl,
  backdropUrl,
  getGenreGradient,
  isPlayableMovie,
  tmdbMediaType,
} from "@/lib/data"
import { fetchDetailWithVideos } from "@/lib/tmdb"
import { useScrollViewport } from "@/lib/scroll-container"


const PREVIEW_OPEN_EVENT = "flick:movie-preview-open"

interface MovieCardProps {
  movie: Movie
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  index?: number
  // "Continue Watching" progress, 0-1 — draws a thin filled bar along the
  // poster's bottom edge when set.
  progressRatio?: number
}

export default function MovieCard({
  movie,
  onPlay,
  onDetails,
  index = 0,
  progressRatio,
}: MovieCardProps) {
  const [showExpanded, setShowExpanded] = useState(false)
  const [isHoveringCard, setIsHoveringCard] = useState(false)
  const { lang, t } = useI18n()
  const [showSynopsis, setShowSynopsis] = useState(false)
  const [synopsisHeight, setSynopsisHeight] = useState(0)
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState<string | null | undefined>(movie.trailerUrl)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cardRef = useRef<HTMLDivElement>(null)
  const previewIdRef = useRef(`preview-${movie.id}-${index}`)
  const synopsisRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const synopsisTogglingRef = useRef(false)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimerRef.current)
  }, [])

  useEffect(() => {
    setResolvedTrailerUrl(movie.trailerUrl)
  }, [movie.id, movie.trailerUrl])

  useEffect(() => {
    if ((!isHoveringCard && !showExpanded) || resolvedTrailerUrl !== undefined || !movie.tmdbId) return
    let cancelled = false
    const tmdbType = tmdbMediaType(movie)
    fetchDetailWithVideos(movie.tmdbId, tmdbType, lang)
      .then((result) => {
        if (!cancelled) setResolvedTrailerUrl(result.trailerUrl || null)
      })
      .catch(() => {
        if (!cancelled) setResolvedTrailerUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [isHoveringCard, showExpanded, resolvedTrailerUrl, movie.tmdbId, movie.type, lang])

  useEffect(() => {
    const closeOtherPreview = (event: Event) => {
      const previewId = (event as CustomEvent<string>).detail
      if (previewId === previewIdRef.current) return
      if (synopsisTogglingRef.current) return

      clearTimeout(showTimerRef.current)
      clearTimeout(hideTimerRef.current)
      setShowExpanded(false)
      setShowSynopsis(false)
    }

    window.addEventListener(PREVIEW_OPEN_EVENT, closeOtherPreview)
    return () => {
      window.removeEventListener(PREVIEW_OPEN_EVENT, closeOtherPreview)
      clearTimeout(showTimerRef.current)
      clearTimeout(hideTimerRef.current)
    }
  }, [])

  // Close expanded on scroll
  const scrollViewport = useScrollViewport()
  useEffect(() => {
    if (!showExpanded || !scrollViewport) return
    const handleScroll = () => {
      cancelHide()
      setShowExpanded(false)
      setShowSynopsis(false)
    }
    scrollViewport.addEventListener("scroll", handleScroll, { once: true })
    return () => scrollViewport.removeEventListener("scroll", handleScroll)
  }, [showExpanded, cancelHide, scrollViewport])

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
    // Always align the preview's top edge to the card's top edge so every hovercard
    // opens at the same height as its card — only nudged up if it would overflow the
    // bottom of the viewport, never bottom-anchored (that made cards near the bottom
    // of a row pop up lower than cards elsewhere in the same row).
    const top = Math.min(
      Math.max(rect.top, viewportPadding),
      window.innerHeight - actualPreviewHeight - viewportPadding
    )
    setPos({ left, top })
  }, [showSynopsis, synopsisHeight])

  useLayoutEffect(() => {
    if (synopsisRef.current && movie.description) {
      const h = synopsisRef.current.scrollHeight
      if (h > 0) setSynopsisHeight(h)
    }
  }, [movie.description, showSynopsis])

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
  }, [showExpanded, showSynopsis, synopsisHeight, calculatePosition])

  const scheduleHide = useCallback((delay = 350) => {
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setShowExpanded(false)
      setShowSynopsis(false)
    }, delay)
  }, [])

  const handleCardEnter = () => {
    // Disable hover preview on touch devices
    if (window.matchMedia("(hover: none)").matches) return
    setIsHoveringCard(true)
    clearTimeout(hideTimerRef.current)
    window.dispatchEvent(
      new CustomEvent<string>(PREVIEW_OPEN_EVENT, { detail: previewIdRef.current })
    )

    if (showExpanded || showTimerRef.current) return
    showTimerRef.current = setTimeout(() => {
      showTimerRef.current = undefined
      if (cardRef.current) {
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
    setIsHoveringCard(false)
    clearTimeout(showTimerRef.current)
    showTimerRef.current = undefined
    scheduleHide(280)
  }

  const handlePreviewInteractiveEnter = () => {
    cancelHide()
  }

  const handlePreviewInteractiveLeave = () => {
    if (synopsisTogglingRef.current) return
    scheduleHide(220)
  }

  const handleClick = () => {
    onDetails?.(movie)
  }

  const imgSrc = posterUrl(movie.posterPath, "w342")
  const bgSrc = backdropUrl(movie.backdropPath, "w780")
  const playableMovie = resolvedTrailerUrl
    ? { ...movie, trailerUrl: resolvedTrailerUrl }
    : movie
  const canPlay = isPlayableMovie(playableMovie)
  const seasonCount = Math.max(movie.seasons || 0, movie.totalSeasons || 0, movie.seasonList?.length || 0)
  const episodeCount = movie.episodes || movie.seriesEpisodes?.length || 0
  const episodeInfo = episodeCount
    ? `${episodeCount} ${t("common.episodes")}`
    : ""
  const seasonInfo =
    (movie.type === "series" || movie.type === "anime") && seasonCount > 0
      ? `${seasonCount} ${seasonCount === 1 ? t("common.season") : t("common.seasons")}`
      : ""
  const hasRuntime = Boolean(movie.duration && movie.duration !== "-")
  const runtimeLabel = seasonInfo || (hasRuntime ? movie.duration : episodeInfo || "...")

  return (
    <>
      <div
        ref={cardRef}
        className="group/card cv-card animate-fade-up"
        onMouseEnter={handleCardEnter}
        onMouseLeave={handleCardLeave}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Poster with title/info overlaid at the bottom, inside the same frame. The scrim
            uses a literal rgba() gradient (not a theme token) so it never gets inverted
            by light mode, and its many stops avoid the banding a plain 2-stop
            black-to-transparent gradient shows. */}
        <div
          className="relative aspect-[2/3] w-full cursor-pointer overflow-hidden bg-neutral-900 shadow-md transition-shadow duration-300 ease-out group-hover/card:shadow-xl light:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.25)] light:group-hover/card:shadow-[0_16px_36px_-8px_rgba(0,0,0,0.35)]"
          onClick={handleClick}
        >
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={movie.title}
              className="h-full w-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover/card:scale-105"
              loading="lazy"
            />
          ) : (
            <div className={`h-full w-full bg-gradient-to-b ${getGenreGradient(movie.genre)}`} />
          )}

          {/* Flat-color dim on hover (not a gradient) — nothing to interpolate unevenly
              against the rounded clip, so no corner seam regardless of theme or opacity. */}
          <div
            className={`absolute inset-0 bg-[rgba(0,0,0,0.45)] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 ${
              showExpanded ? "opacity-100" : ""
            }`}
          />

          {movie.quality && (
            <span className="absolute top-2 right-2 rounded-md bg-[rgba(0,0,0,0.6)] px-1.5 py-0.5 text-[9px] font-semibold text-[rgba(255,255,255,0.9)] backdrop-blur-md">
              {movie.quality}
            </span>
          )}

          {progressRatio !== undefined && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-[rgba(0,0,0,0.6)] px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-md">
              <Play className="size-2.5 fill-white" />
              {t("common.resume")}
            </span>
          )}

          {/* Bottom scrim + info — always visible, no gradient banding thanks to the
              eased multi-stop rgba gradient instead of a flat black→transparent one. */}
          <div
            className="absolute right-0 bottom-0 left-0 flex h-4/5 flex-col justify-end px-2.5 pb-2"
            style={{
              backgroundImage:
                "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.97) 12%, rgba(0,0,0,0.88) 24%, rgba(0,0,0,0.74) 36%, rgba(0,0,0,0.56) 48%, rgba(0,0,0,0.38) 60%, rgba(0,0,0,0.22) 72%, rgba(0,0,0,0.1) 84%, rgba(0,0,0,0) 100%)",
            }}
          >
            {movie.episodeNumber != null && (
              <p className="line-clamp-1 text-[10px] font-semibold tracking-wide text-[rgba(255,255,255,0.65)] uppercase">
                {movie.seasonNumber ? `T${movie.seasonNumber} · E${movie.episodeNumber}` : `E${movie.episodeNumber}`}
              </p>
            )}
            <p className="line-clamp-1 text-sm font-medium text-[#fff]" title={movie.title}>
              {movie.title}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[rgba(255,255,255,0.75)]">
              <span className="shrink-0">{movie.year}</span>
              <span className="shrink-0 text-[rgba(255,255,255,0.4)]">•</span>
              <span className="truncate">{runtimeLabel}</span>
              <span className="ml-auto flex shrink-0 items-center gap-0.5 font-medium text-amber-400">
                <Star className="size-3 fill-amber-400" />
                {movie.rating}
              </span>
            </div>

            {progressRatio !== undefined && (
              <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                  style={{ width: `${Math.min(100, Math.max(0, progressRatio * 100))}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Netflix-style expanded preview — fixed position to avoid overflow clipping */}
      {showExpanded && createPortal(
        <article
          ref={previewRef}
          className="pointer-events-none fixed z-[9999] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-md bg-neutral-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur-2xl animate-scale-in"
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-900">
            {bgSrc ? (
              <img src={bgSrc} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
            ) : imgSrc ? (
              <img src={imgSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${getGenreGradient(movie.genre)}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[rgba(0,0,0,0.2)] to-[rgba(0,0,0,0.1)]" />

            <div className="absolute top-3 right-3 flex items-center gap-2">
              {movie.quality && (
                <span className="rounded-md border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.55)] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#fff] backdrop-blur-md">
                  {movie.quality}
                </span>
              )}
            </div>

            <div
              className="pointer-events-auto absolute right-4 bottom-4 left-4"
              onMouseEnter={handlePreviewInteractiveEnter}
              onMouseLeave={handlePreviewInteractiveLeave}
            >
              <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-[#fff] drop-shadow-lg">
                {movie.title}
              </h3>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-[rgba(255,255,255,0.75)]">
                <span>{movie.year}</span>
                <span className="size-1 rounded-full bg-[rgba(255,255,255,0.4)]" />
                <span>{runtimeLabel}</span>
                <span className="ml-auto flex items-center gap-1 font-medium text-[#fff]">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {movie.rating}
                </span>
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
                  className="h-9 flex-1 rounded-md bg-white text-xs font-semibold text-black hover:bg-neutral-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPlay?.(playableMovie)
                  }}
                >
                  <Play className="size-4 fill-black" />
                  {progressRatio !== undefined ? t("common.resume") : t("common.play")}
                </Button>
              )}
              {movie.description && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t("common.details")}
                  className="size-9 shrink-0 rounded-md text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    synopsisTogglingRef.current = true
                    setTimeout(() => { synopsisTogglingRef.current = false }, 350)
                    setShowSynopsis((prev) => !prev)
                  }}
                >
                  <ChevronDown className={`size-4 transition-transform duration-200 ${showSynopsis ? "rotate-180" : ""}`} />
                </Button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-neutral-400">
              {movie.contentRating && (
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-medium text-neutral-200">
                  {movie.contentRating}
                </span>
              )}
              <span className="rounded-md border border-white/10 px-2 py-1">
                {runtimeLabel}
              </span>
              <span className="rounded-md border border-white/10 px-2 py-1">
                {movie.type === "movie" ? t("common.movies") : movie.type === "series" ? t("common.series") : t("common.anime")}
              </span>
            </div>

            {movie.description && (
              <div
                ref={synopsisRef}
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: showSynopsis ? synopsisHeight : 0,
                  opacity: showSynopsis ? 1 : 0,
                  transform: showSynopsis ? "translateY(0)" : "translateY(-8px)",
                }}
              >
                <div className="pt-3">
                  <p className="line-clamp-4 text-xs leading-relaxed text-neutral-400">
                    {movie.description}
                  </p>
                </div>
                <div className="h-4" />
              </div>
            )}

            <div className={`flex flex-wrap gap-1.5 pt-3${!movie.description ? ' mt-4' : ''}`}>
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


