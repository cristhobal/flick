"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Plus, ChevronDown, Star } from "lucide-react"
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
  onFavorite?: (movie: Movie) => void
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
  const [synopsisAnim, setSynopsisAnim] = useState<"idle" | "entering" | "closing">("idle")
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState<string | null | undefined>(movie.trailerUrl)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const synopsisTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cardRef = useRef<HTMLDivElement>(null)
  const previewIdRef = useRef(`preview-${movie.id}-${index}`)

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

      clearTimeout(showTimerRef.current)
      clearTimeout(hideTimerRef.current)
      setShowExpanded(false)
      setShowSynopsis(false)
      setSynopsisAnim("idle")
    }

    window.addEventListener(PREVIEW_OPEN_EVENT, closeOtherPreview)
    return () => {
      window.removeEventListener(PREVIEW_OPEN_EVENT, closeOtherPreview)
      clearTimeout(showTimerRef.current)
      clearTimeout(hideTimerRef.current)
      clearTimeout(synopsisTimerRef.current)
    }
  }, [])

  // Close expanded on scroll
  useEffect(() => {
    if (!showExpanded) return
    const handleScroll = () => {
      cancelHide()
      setShowExpanded(false)
      setShowSynopsis(false)
      setSynopsisAnim("idle")
    }
    window.addEventListener("scroll", handleScroll, { once: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [showExpanded, cancelHide])

  const scheduleHide = useCallback((delay = 350) => {
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setShowExpanded(false)
      setShowSynopsis(false)
      setSynopsisAnim("idle")
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
        const previewWidth = Math.min(340, window.innerWidth - 24)
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
          window.innerHeight - viewportPadding
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

  const handlePreviewEnter = () => {
    cancelHide()
  }

  const handlePreviewLeave = () => {
    scheduleHide(420)
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
  const runtimeLabel = seasonInfo || (hasRuntime ? movie.duration : episodeInfo || "-")
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
      {showExpanded && (
        <>
          <article
            className="fixed z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.75)] animate-scale-in"
            style={{ left: pos.left, top: pos.top }}
            onMouseEnter={handlePreviewEnter}
            onMouseLeave={handlePreviewLeave}
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

              <div className="absolute right-4 bottom-4 left-4">
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

            <div className="p-4">
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
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled
                  title={t("common.availableSoon")}
                  className="size-9 shrink-0 rounded-lg border-white/10 bg-white/[0.03] text-neutral-500"
                >
                  <Plus className="size-4" />
                </Button>
                {movie.description && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title={t("common.details")}
                    className="size-9 shrink-0 rounded-lg text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (synopsisAnim === "idle") {
                        setShowSynopsis(true)
                        setSynopsisAnim("entering")
                      } else if (synopsisAnim === "entering") {
                        setSynopsisAnim("closing")
                        synopsisTimerRef.current = setTimeout(() => {
                          setShowSynopsis(false)
                          setSynopsisAnim("idle")
                        }, 200)
                      } else {
                        clearTimeout(synopsisTimerRef.current)
                        setSynopsisAnim("entering")
                        setShowSynopsis(true)
                      }
                    }}
                  >
                    <ChevronDown className={`size-4 transition-transform duration-200 ${synopsisAnim === "entering" ? "rotate-180" : ""}`} />
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

              {showSynopsis && movie.description && (
                <div className={`mt-4 overflow-hidden border-t border-white/5 pt-3 ${synopsisAnim === "closing" ? "animate-slide-up" : "animate-slide-down"}`}>
                  <p className="line-clamp-4 text-xs leading-relaxed text-neutral-400">
                    {movie.description}
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
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
          </article>
        </>
      )}
    </>
  )
}
