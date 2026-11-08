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
import { useWatchState } from "@/lib/use-watch-state"
import { episodeRefOf } from "@/lib/watch-progress"


const PREVIEW_OPEN_EVENT = "flick:movie-preview-open"
const PREVIEW_VIEWPORT_PADDING = 12

/**
 * Decides which way the preview's description unfolds and which edge to pin the preview
 * by while it does. Pure geometry, so the arrow (which points the way before anything is
 * clicked) and the expansion itself run the exact same calculation off the exact same
 * measurements — they used to each carry their own copy and disagree on the first open.
 *
 * Growing down keeps the top edge put; growing up pins the bottom edge, so the preview
 * and the description rise together instead of running off the bottom of the screen.
 * Either way the result is clamped so the expanded box stays on screen.
 */
function resolveExpansion(
  top: number,
  previewHeight: number,
  synopsisHeight: number,
  viewportHeight: number
): { direction: "down" | "up"; pinned: { top: number } | { bottom: number } } {
  const expandedHeight = previewHeight + synopsisHeight
  // Taller than the whole viewport (a short browser window): it fits no direction. Pin
  // the head to the top so the poster and title stay visible and the overflow falls off
  // the bottom, which is where truncation is least surprising.
  if (expandedHeight > viewportHeight - PREVIEW_VIEWPORT_PADDING * 2) {
    return { direction: "down", pinned: { top: PREVIEW_VIEWPORT_PADDING } }
  }
  const roomBelow = viewportHeight - PREVIEW_VIEWPORT_PADDING - (top + previewHeight)
  const roomAbove = top - PREVIEW_VIEWPORT_PADDING
  // Prefer down; fall back to up; if neither side alone has room take the roomier one —
  // the clamps below then slide the preview just far enough to fit.
  const direction: "down" | "up" =
    roomBelow >= synopsisHeight ? "down" : roomAbove >= synopsisHeight || roomAbove > roomBelow ? "up" : "down"
  // The highest the top edge may sit and still leave the whole expanded box on screen.
  const highestTop = Math.max(
    PREVIEW_VIEWPORT_PADDING,
    viewportHeight - PREVIEW_VIEWPORT_PADDING - expandedHeight
  )
  if (direction === "down") {
    // A no-op whenever the description fits below; it only slides the preview when the
    // two sides had to split the room between them.
    return { direction, pinned: { top: Math.max(PREVIEW_VIEWPORT_PADDING, Math.min(top, highestTop)) } }
  }
  return {
    direction,
    pinned: {
      bottom: Math.max(
        PREVIEW_VIEWPORT_PADDING,
        Math.min(viewportHeight - (top + previewHeight), viewportHeight - PREVIEW_VIEWPORT_PADDING - expandedHeight)
      ),
    },
  }
}

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
  progressRatio: progressRatioProp,
}: MovieCardProps) {
  const [showExpanded, setShowExpanded] = useState(false)
  const [isHoveringCard, setIsHoveringCard] = useState(false)
  const { lang, t } = useI18n()
  const [showSynopsis, setShowSynopsis] = useState(false)
  const [synopsisHeight, setSynopsisHeight] = useState(0)
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState<string | null | undefined>(movie.trailerUrl)
  // Where the floating preview is pinned. It is anchored by ONE edge and CSS does the
  // rest: `top` for the normal downward growth, `bottom` when there is no room below and
  // the description has to open upward (see toggleSynopsis). Anchoring by an edge is what
  // makes the growth smooth — repositioning from JS on every animation frame lagged the
  // content by a frame and made the card shake.
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0, top: 0 })
  const [expandDirection, setExpandDirection] = useState<"down" | "up">("down")
  // The description is animating open/closed: nothing may re-place the card meanwhile.
  const synopsisAnimatingRef = useRef(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cardRef = useRef<HTMLDivElement>(null)
  const previewIdRef = useRef(`preview-${movie.id}-${index}`)
  const synopsisRef = useRef<HTMLDivElement>(null)
  // The description's natural height has to be read off an inner box: the element that
  // animates is clipped to `max-height: 0` while closed, so it measures 0 from outside.
  const synopsisContentRef = useRef<HTMLDivElement>(null)
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
    // Once the preview is bottom-anchored (opened upward) or its description is mid-
    // animation, its position is decided by toggleSynopsis — hands off.
    if (synopsisAnimatingRef.current || pos.bottom !== undefined) return
    const rect = cardRef.current.getBoundingClientRect()
    const previewEl = previewRef.current
    const actualPreviewHeight = previewEl.offsetHeight
    const actualPreviewWidth = previewEl.offsetWidth
    const viewportPadding = PREVIEW_VIEWPORT_PADDING
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
  }, [pos.bottom])

  // Measure the description the moment the preview mounts — before the first paint, and
  // long before anyone can click the chevron. Every placement decision below needs this
  // number; while it was still 0 the preview concluded the description weighed nothing
  // and always opened downward on the first try. A ResizeObserver keeps it honest
  // afterwards (a late web font or a reflow changes how many lines the synopsis takes).
  useLayoutEffect(() => {
    const content = synopsisContentRef.current
    if (!content) return
    const measure = () => {
      const height = content.offsetHeight
      if (height > 0) setSynopsisHeight((prev) => (prev === height ? prev : height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [showExpanded, movie.description])

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

  // Point the arrow the right way as soon as the preview is on screen. Re-runs when the
  // measured description height lands, so the very first click already knows the answer.
  useLayoutEffect(() => {
    const preview = previewRef.current
    if (!showExpanded || showSynopsis || !preview || pos.bottom !== undefined) return
    const top = pos.top ?? preview.getBoundingClientRect().top
    // Derived from DOM measurements, which only exist after layout.
    const { direction } = resolveExpansion(
      top,
      preview.offsetHeight,
      synopsisHeight,
      document.documentElement.clientHeight
    )
    setExpandDirection(direction)
  }, [showExpanded, showSynopsis, synopsisHeight, pos.top, pos.bottom])

  const scheduleHide = useCallback((delay = 350) => {
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setShowExpanded(false)
      setShowSynopsis(false)
    }, delay)
  }, [])

  // Opens/closes the description. The direction and the anchor edge come from
  // resolveExpansion, which has had the real description height since the preview
  // mounted — the same answer the arrow has been showing all along. Anchoring by one
  // edge is what keeps the growth smooth: CSS does the rest, nothing is repositioned
  // mid-animation. Closing retraces whichever way it opened.
  const toggleSynopsis = useCallback(() => {
    synopsisTogglingRef.current = true
    setTimeout(() => { synopsisTogglingRef.current = false }, 350)
    synopsisAnimatingRef.current = true
    setTimeout(() => { synopsisAnimatingRef.current = false }, 400)

    const preview = previewRef.current
    if (!showSynopsis && preview) {
      const top = pos.top ?? preview.getBoundingClientRect().top
      const { direction, pinned } = resolveExpansion(
        top,
        preview.offsetHeight,
        synopsisHeight,
        document.documentElement.clientHeight
      )
      setExpandDirection(direction)
      setPos((prev) => ({ left: prev.left, ...pinned }))
    }
    setShowSynopsis((prev) => !prev)
  }, [showSynopsis, synopsisHeight, pos.top])

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
  // The "Continue Watching" row passes an authoritative ratio; everywhere else,
  // fall back to this title's own stored progress so the card and its button
  // read "Reanudar" wherever the title appears, not just in that one row.
  const ownWatchState = useWatchState(progressRatioProp === undefined ? movie.id : null)
  const progressRatio = progressRatioProp ?? (ownWatchState.inProgress ? ownWatchState.ratio : undefined)
  // Which episode this card is up to. Two sources, because the same show reaches the card
  // two different ways: "Continue Watching" hands over the episode itself, while its own
  // row hands over the series and the resume point has to be looked up from storage. Both
  // end up labelled identically, which is the point.
  const storedEpisode = episodeRefOf(ownWatchState.entry)
  const resumeSeason = movie.episodeNumber != null ? movie.seasonNumber : storedEpisode?.season
  const resumeEpisode = movie.episodeNumber ?? storedEpisode?.episode
  const resumeEpisodeLabel =
    resumeEpisode != null ? (resumeSeason ? `T${resumeSeason} · E${resumeEpisode}` : `E${resumeEpisode}`) : null
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
  // Empty when the details aren't known: the label (and its separator) is left out
  // rather than drawn as a "..." placeholder.
  const runtimeLabel = seasonInfo || (hasRuntime ? movie.duration : episodeInfo)

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
            {/* Where the viewer is up to. Drawn from resumeEpisodeLabel rather than from
                movie.episodeNumber alone, so the same show is labelled identically in
                "Continue Watching" (which hands over the episode) and in its own row
                (which hands over the series, with the episode looked up from storage). */}
            {resumeEpisodeLabel && (
              <p className="line-clamp-1 text-[10px] font-semibold tracking-wide text-[rgba(255,255,255,0.65)] uppercase">
                {resumeEpisodeLabel}
              </p>
            )}
            <p className="line-clamp-1 text-sm font-medium text-[#fff]" title={movie.title}>
              {movie.title}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[rgba(255,255,255,0.75)]">
              <span className="shrink-0">{movie.year}</span>
              {runtimeLabel && (
                <>
                  <span className="shrink-0 text-[rgba(255,255,255,0.4)]">•</span>
                  <span className="truncate">{runtimeLabel}</span>
                </>
              )}
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
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
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
                {runtimeLabel && (
                  <>
                    <span className="size-1 rounded-full bg-[rgba(255,255,255,0.4)]" />
                    <span>{runtimeLabel}</span>
                  </>
                )}
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
                    toggleSynopsis()
                  }}
                >
                  {/* Points the way the description will open / has opened. */}
                  <ChevronDown
                    className={`size-4 transition-transform duration-200 ${
                      (expandDirection === "up") !== showSynopsis ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-neutral-400">
              {movie.contentRating && (
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-medium text-neutral-200">
                  {movie.contentRating}
                </span>
              )}
              {runtimeLabel && (
                <span className="rounded-md border border-white/10 px-2 py-1">
                  {runtimeLabel}
                </span>
              )}
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
                  // Slides in from the side the card is growing toward.
                  transform: showSynopsis ? "translateY(0)" : expandDirection === "up" ? "translateY(8px)" : "translateY(-8px)",
                }}
              >
                <div ref={synopsisContentRef}>
                  <div className="pt-3">
                    <p className="line-clamp-4 text-xs leading-relaxed text-neutral-400">
                      {movie.description}
                    </p>
                  </div>
                  <div className="h-4" />
                </div>
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


