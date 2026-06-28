"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Play, Info, Heart, Star } from "lucide-react"
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
    // Sin mt-16: el header fixed transparente flota encima del hero
    // min-h-[90vh] para que ocupe casi toda la pantalla
    <section
      className={`min-h-[90vh] w-full overflow-hidden bg-black sm:min-h-screen ${
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
      <div className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
      <div className="absolute right-0 bottom-0 left-0 h-3/5 bg-gradient-to-t from-black via-black/60 to-transparent" />

      {/* Contenido centrado verticalmente.
          pt-16 = espacio para el header fijo (64px).
          flex + justify-center lo centra en el espacio restante. */}
      <div className="absolute inset-0 z-10 flex flex-col justify-center pt-16 pb-[10vh]">
        <div className="w-full max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4">
            {/* Title */}
            <h1 className={`${contentAnimation} hero-stagger-title max-w-4xl pb-2 text-4xl leading-[1.08] font-bold tracking-tight text-balance text-white drop-shadow-lg sm:text-5xl lg:text-6xl xl:text-7xl`}>
              {movie.title}
            </h1>

            {/* Meta info */}
            <div className={`${contentAnimation} hero-stagger-meta flex flex-wrap items-center gap-3 text-sm text-neutral-400`}>
              <span className="text-white/80">{movie.year}</span>
              <span className="h-4 w-px bg-neutral-700" />
              <span>{resolvedDuration && resolvedDuration !== "-" ? resolvedDuration : t("common.noAvailable")}</span>
              <span className="h-4 w-px bg-neutral-700" />
              <div className="flex items-center gap-1">
                <Star className="size-4 fill-neutral-400 text-neutral-400" />
                <span className="text-white/80">{movie.rating}</span>
              </div>
              <span className="h-4 w-px bg-neutral-700" />
              <span className="text-neutral-500">
                {movie.language.slice(0, 2).map((language) => displayLanguage(language, lang)).join(" / ")}
              </span>
            </div>

            {/* Description */}
            <p className={`${contentAnimation} hero-stagger-description line-clamp-3 max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base`}>
              {movie.description}
            </p>

            {/* Actions */}
            <div className={`${contentAnimation} hero-stagger-actions mt-2 flex flex-wrap items-center gap-3`}>
              {canPlay && (
                <Button
                  size="lg"
                  className="gap-2 border-0 bg-white text-black transition-all duration-300 hover:scale-105 hover:bg-neutral-200 active:scale-95"
                  onClick={() => onPlay?.(playableMovie)}
                >
                  <Play className="size-5 fill-black" />
                  {t("common.play")}
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="gap-2 border-white/20 text-white transition-all duration-300 hover:scale-105 hover:bg-white/10 active:scale-95"
                onClick={() => onDetails?.(movie)}
              >
                <Info className="size-5" />
                {t("common.details")}
              </Button>
              <Button
                size="lg"
                variant="ghost"
                disabled
                title={t("common.availableSoon")}
                className="gap-2 text-neutral-500"
              >
                <Heart className="size-5" />
                {t("common.favoritesSoon")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
