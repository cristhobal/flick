"use client"

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, ChevronDown, Star } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { translateGenre, translateGenres } from "@/i18n/translations"
import {
  posterUrl,
  backdropUrl,
  getGenreGradient,
  isPlayableMovie,
} from "@/lib/data"
import { fetchDetailWithVideos } from "@/lib/tmdb"


const PREVIEW_OPEN_EVENT = "flick:movie-preview-open"

interface MovieCardProps {
  movie: Movie
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  index?: number
}

export default function MovieCard({
  movie,
  onPlay,
  onDetails,
  index = 0,
}: MovieCardProps) {
  const [showExpanded, setShowExpanded] = useState(false)
  const [isHoveringCard, setIsHoveringCard] = useState(false)
  const { lang, t } = useI18n()
  const [showSynopsis, setShowSynopsis] = useState(false)
  const [synopsisHeight, setSynopsisHeight] = useState(0)
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState<string | null | undefined>(movie.trailerUrl)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [expandUpward, setExpandUpward] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cardRef = useRef<HTMLDivElement>(null)
  const previewIdRef = useRef(`preview-${movie.id}-${index}`)
  const synopsisRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const synopsisTogglingRef = useRef(false)

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimerRef.current)
  }, [])

  useEffect(() => {
    setResolvedTrailerUrl(movie.trailerUrl)
  }, [movie.id, movie.trailerUrl])

  useEffect(() => {
    if ((!isHoveringCard && !showExpanded) || resolvedTrailerUrl !== undefined || !movie.tmdbId) return
    let cancelled = false
    const tmdbType = movie.type === "series" || movie.type === "anime" ? "tv" : "movie"
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
  useEffect(() => {
    if (!showExpanded) return
    const handleScroll = () => {
      cancelHide()
      setShowExpanded(false)
      setShowSynopsis(false)
    }
    window.addEventListener("scroll", handleScroll, { once: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [showExpanded, cancelHide])

  const calculatePosition = useCallback(() => {
    if (!cardRef.current || !previewRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const previewRect = previewRef.current.getBoundingClientRect()
    const actualPreviewHeight = previewRect.height
    const actualPreviewWidth = previewRect.width
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
    if (synopsisRef.current && movie.description) {
      const h = synopsisRef.current.scrollHeight
      if (h > 0) setSynopsisHeight(h)
    }
  }, [movie.description, showSynopsis])

  useLayoutEffect(() => {
    if (showExpanded) {
      calculatePosition()
    }
  }, [showExpanded, showSynopsis, calculatePosition])

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
  const genreLabel = translateGenres(movie.genre, lang).join(", ")

  return (
    <>
      <div
        ref={cardRef}
        className="group/card animate-fade-up"
        onMouseEnter={handleCardEnter}
        onMouseLeave={handleCardLeave}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Original poster card — no scale on wrapper */}
        <div
          className="relative cursor-pointer overflow-hidden rounded-xl bg-neutral-900 shadow-lg transition-all duration-300 ease-out hover:shadow-2xl active:shadow-md"
          onClick={handleClick}
        >
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-900">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={movie.title}
                className="h-full w-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover/card:scale-110"
                loading="lazy"
              />
            ) : (
              <div
                className={`h-full w-full bg-gradient-to-b ${getGenreGradient(movie.genre)}`}
              />
            )}

            <div
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
                showExpanded ? "opacity-100" : "opacity-0"
              }`}
            />

            <div className="absolute right-0 bottom-0 left-0 h-1/2 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            <div className="absolute top-2 right-2 left-2 z-10 flex min-w-0 items-center justify-between gap-1.5 transition-transform duration-300 group-hover/card:scale-90">
              <span
                className="min-w-0 truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-neutral-300 backdrop-blur-sm"
                title={genreLabel}
              >
                {genreLabel}
              </span>
              {movie.quality && (
                <Badge className="shrink-0 border-0 bg-white/10 text-[10px] text-white backdrop-blur-sm">
                  {movie.quality}
                </Badge>
              )}
            </div>


            <div className="absolute right-0 bottom-0 left-0 flex min-h-24 flex-col justify-end p-3">
              <p className="line-clamp-2 text-sm font-medium leading-[1.125rem] text-white drop-shadow-lg transition-transform duration-300 group-hover/card:translate-y-[-2px]">
                {movie.title}
              </p>
              <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[11px] text-neutral-300 transition-opacity duration-300 group-hover/card:opacity-80">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">{movie.year}</span>
                  <span className="h-3 w-px shrink-0 bg-neutral-600" />
                  <span className="truncate">{runtimeLabel}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Star className="size-3 fill-neutral-300 text-neutral-300" />
                  <span>{movie.rating}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Netflix-style expanded preview — fixed position to avoid overflow clipping */}
      {showExpanded && createPortal(
        <article
          ref={previewRef}
          className="pointer-events-none fixed z-[9999] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.75)] animate-scale-in"
          style={{ left: pos.left, ...(expandUpward ? { bottom: pos.top } : { top: pos.top }) }}
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-900">
            {bgSrc ? (
              <img src={bgSrc} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
            ) : imgSrc ? (
              <img src={imgSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${getGenreGradient(movie.genre)}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-black/20 to-black/10" />

            <div className="absolute top-3 right-3 flex items-center gap-2">
              {movie.quality && (
                <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
                  {movie.quality}
                </span>
              )}
            </div>

            <div
              className="pointer-events-auto absolute right-4 bottom-4 left-4"
              onMouseEnter={handlePreviewInteractiveEnter}
              onMouseLeave={handlePreviewInteractiveLeave}
            >
              <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-white drop-shadow-lg">
                {movie.title}
              </h3>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-300">
                <span>{movie.year}</span>
                <span className="size-1 rounded-full bg-neutral-500" />
                <span>{runtimeLabel}</span>
                <span className="ml-auto flex items-center gap-1 font-medium text-white">
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
                  className="h-9 flex-1 rounded-lg bg-white text-xs font-semibold text-black hover:bg-neutral-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPlay?.(playableMovie)
                  }}
                >
                  <Play className="size-4 fill-black" />
                  {t("common.play")}
                </Button>
              )}
              {movie.description && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t("common.details")}
                  className="size-9 shrink-0 rounded-lg text-neutral-400 hover:bg-white/[0.06] hover:text-white"
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
                <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-medium text-neutral-200">
                  {movie.contentRating}
                </span>
              )}
              <span className="rounded border border-white/10 px-2 py-1">
                {runtimeLabel}
              </span>
              <span className="rounded border border-white/10 px-2 py-1">
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


