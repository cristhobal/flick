"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Play, Info, Star } from "lucide-react"
import type { Movie } from "@/lib/data"
import { backdropUrl, getGenreGradient, isPlayableMovie } from "@/lib/data"
import { fetchDetailWithVideos } from "@/lib/tmdb"
import { useI18n } from "@/i18n/I18nProvider"
import { displayLanguage } from "@/i18n/translations"

interface HeroSectionProps {
  movie: Movie
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  onFavorite?: (movie: Movie) => void
  isFavorite?: boolean
  phase?: "enter" | "exit"
}

function runtimeStr(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function HeroSection({
  movie,
  onPlay,
  onDetails,
  onFavorite,
  isFavorite = false,
  phase = "enter",
}: HeroSectionProps) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState<string | null | undefined>(movie.trailerUrl)
  const [resolvedDuration, setResolvedDuration] = useState(movie.duration)
  const { lang, t } = useI18n()
  const bgSrc = backdropUrl(movie.backdropPath, "original")
  const playableMovie = resolvedTrailerUrl
    ? { ...movie, trailerUrl: resolvedTrailerUrl }
    : movie
  const canPlay = isPlayableMovie(playableMovie)
  const contentAnimation = phase === "enter" ? "hero-content-enter" : "hero-content-exit"
  const seasonCount = Math.max(movie.seasons || 0, movie.totalSeasons || 0, movie.seasonList?.length || 0)
  const heroRuntimeLabel =
    (movie.type === "series" || movie.type === "anime") && seasonCount > 0
      ? `${seasonCount} ${seasonCount === 1 ? t("common.season") : t("common.seasons")}`
      : resolvedDuration && resolvedDuration !== "-"
        ? resolvedDuration
        : t("common.noAvailable")

  useEffect(() => {
    setResolvedTrailerUrl(movie.trailerUrl)
    setResolvedDuration(movie.duration)
  }, [movie.id, movie.trailerUrl, movie.duration])

  useEffect(() => {
    if (resolvedTrailerUrl !== undefined || movie.tmdbId <= 0) return
    let cancelled = false
    const tmdbType = movie.type === "series" || movie.type === "anime" ? "tv" : "movie"
    fetchDetailWithVideos(movie.tmdbId, tmdbType, lang)
      .then((result) => {
        if (!cancelled) {
          const detailRuntime = result.detail?.runtime || result.detail?.episode_run_time?.find((minutes) => minutes > 0) || result.detail?.last_episode_to_air?.runtime
          setResolvedTrailerUrl(result.trailerUrl || null)
          setResolvedDuration(runtimeStr(detailRuntime))
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedTrailerUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [resolvedTrailerUrl, movie.tmdbId, movie.type, lang])

  return (
    <section
      className={`min-h-[68svh] w-full overflow-hidden bg-black sm:min-h-[90vh] lg:min-h-screen ${
        phase === "exit"
          ? "hero-cinematic-exit absolute inset-0 z-0"
          : "hero-cinematic-enter relative z-10"
      }`}
    >
      {/* Background with Ken Burns zoom */}
      {bgSrc && (
        <img
          src={bgSrc}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover will-change-transform ${
            imgLoaded ? "animate-ken-burns opacity-40" : "opacity-0"
          }`}
          style={{ transition: imgLoaded ? undefined : "opacity 1s ease" }}
          onLoad={() => setImgLoaded(true)}
        />
      )}

      {/* Fallback gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-b ${getGenreGradient(movie.genre)} transition-opacity duration-1000 ${
          imgLoaded ? "opacity-60" : "opacity-100"
        }`}
      />

      {/* Ambient light effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.04)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-black/45 sm:bg-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/15 sm:from-black/90 sm:via-black/50 sm:to-transparent lg:w-1/2" />
      <div className="absolute right-0 bottom-0 left-0 h-3/4 bg-gradient-to-t from-black via-black/70 to-transparent sm:h-3/5 sm:via-black/60" />

      {/* Content — vertically centered, safe padding for header */}
      <div className="absolute inset-0 z-10 flex flex-col justify-center py-14 sm:pb-[8vh] sm:pt-16 lg:pb-[10vh]">
        <div className="content-container">
          <div className="flex max-w-full flex-col items-start gap-3 sm:max-w-2xl sm:gap-4 lg:max-w-4xl">
            {/* Title */}
            <h1 className={`${contentAnimation} hero-stagger-title max-w-full pb-1 text-3xl leading-[1.1] font-bold tracking-tight text-balance text-white drop-shadow-lg sm:pb-2 sm:text-5xl lg:text-6xl xl:text-7xl`}>
              {movie.title}
            </h1>

            {/* Meta info */}
            <div className={`${contentAnimation} hero-stagger-meta flex flex-wrap items-center gap-2 text-xs text-neutral-400 sm:gap-3 sm:text-sm`}>
              <span className="text-white/80">{movie.year}</span>
              <span className="h-3.5 w-px bg-neutral-700 sm:h-4" />
              <span>{heroRuntimeLabel}</span>
              <span className="h-3.5 w-px bg-neutral-700 sm:h-4" />
              <div className="flex items-center gap-1">
                <Star className="size-3.5 fill-neutral-400 text-neutral-400 sm:size-4" />
                <span className="text-white/80">{movie.rating}</span>
              </div>
              <span className="hidden h-4 w-px bg-neutral-700 sm:block" />
              <span className="hidden text-neutral-500 sm:inline">
                {movie.language.slice(0, 2).map((language) => displayLanguage(language, lang)).join(" / ")}
              </span>
            </div>

            {/* Description — hidden on very small screens */}
            <p className={`${contentAnimation} hero-stagger-description line-clamp-2 max-w-full text-xs leading-relaxed text-neutral-300 sm:line-clamp-3 sm:text-sm md:text-base lg:text-neutral-400`}>
              {movie.description}
            </p>

            {/* Actions */}
            <div className={`${contentAnimation} hero-stagger-actions mt-1 flex flex-wrap items-center gap-2 sm:mt-2 sm:gap-3`}>
              {canPlay && (
                <Button
                  size="default"
                  className="h-9 gap-2 border-0 bg-white px-4 text-sm text-black transition-all duration-300 hover:scale-105 hover:bg-neutral-200 active:scale-95 sm:h-11 sm:px-6 sm:text-base"
                  onClick={() => onPlay?.(playableMovie)}
                >
                  <Play className="size-4 fill-black sm:size-5" />
                  {t("common.play")}
                </Button>
              )}
              <Button
                size="default"
                variant="outline"
                className="h-9 gap-2 border-white/20 px-4 text-sm text-white transition-all duration-300 hover:scale-105 hover:bg-white/10 active:scale-95 sm:h-11 sm:px-6 sm:text-base"
                onClick={() => onDetails?.(movie)}
              >
                <Info className="size-4 sm:size-5" />
                {t("common.details")}
              </Button>
              <Button
                size="default"
                variant="ghost"
                title={isFavorite ? t("favorites.removeAria") : t("favorites.addAria")}
                className="hidden h-9 gap-2 text-sm text-neutral-400 hover:bg-white/10 hover:text-white sm:flex sm:h-11 sm:text-base"
                onClick={() => onFavorite?.(movie)}
              >
                <Star className={`size-4 sm:size-5 ${isFavorite ? "fill-white text-white" : "fill-transparent text-white/70"}`} />
                {isFavorite ? t("favorites.activeAction") : t("favorites.addAction")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
