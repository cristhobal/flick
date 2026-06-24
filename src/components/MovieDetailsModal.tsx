"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Heart, Star, Clock, Languages, Subtitles } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { displayLanguage, translateGenre } from "@/i18n/translations"
import {
  posterUrl,
  backdropUrl,
  getGenreGradient,
  isPlayableMovie,
} from "@/lib/data"


interface MovieDetailsModalProps {
  movie: Movie | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlay?: (movie: Movie) => void
}

export default function MovieDetailsModal({
  movie,
  open,
  onOpenChange,
  onPlay,
}: MovieDetailsModalProps) {
  const { lang, t } = useI18n()
  if (!movie) return null

  const bgSrc = backdropUrl(movie.backdropPath, "w1280")
  const posterSrc = posterUrl(movie.posterPath, "w342")
  const canPlay = isPlayableMovie(movie)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-neutral-800 bg-neutral-950 p-0 text-white">
        {/* Banner */}
        <div className="relative h-64 w-full overflow-hidden sm:h-80">
          {bgSrc ? (
            <img
              src={bgSrc}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className={`h-full w-full bg-gradient-to-b ${getGenreGradient(movie.genre)}`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />

          {/* Poster overlay on banner */}
          {posterSrc && (
            <div className="absolute bottom-6 left-6 hidden h-40 w-28 overflow-hidden rounded-lg shadow-xl sm:block">
              <img
                src={posterSrc}
                alt={movie.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {/* Quality badge */}
          <div className="absolute top-4 left-4 z-10">
            <Badge className="border-0 bg-white/10 text-xs text-white backdrop-blur-sm">
              {movie.quality}
            </Badge>
          </div>

          {/* Title */}
          <div className="absolute right-0 bottom-0 left-0 p-6">
            <DialogHeader>
              <DialogTitle className="text-3xl font-bold tracking-tight text-white drop-shadow-lg">
                {movie.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("details.label", { title: movie.title })}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 px-6 pb-6">
          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
            <span className="text-white/70">{movie.year}</span>
            <span className="h-4 w-px bg-neutral-700" />
            <span>{movie.duration}</span>
            <span className="h-4 w-px bg-neutral-700" />
            <div className="flex items-center gap-1">
              <Star className="size-4 fill-neutral-400 text-neutral-400" />
              <span className="text-white/70">{movie.rating}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {canPlay && (
              <Button
                className="gap-2 border-0 bg-white text-black hover:bg-neutral-200"
                onClick={() => {
                  onPlay?.(movie)
                  onOpenChange(false)
                }}
              >
                <Play className="size-4 fill-black" />
                {t("common.play")}
              </Button>
            )}
            <Button
              variant="outline"
              disabled
              title={t("common.availableSoon")}
              className="gap-2 border-white/10 text-neutral-500"
            >
              <Heart className="size-4" />
              {t("common.favoritesSoon")}
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-neutral-300">
              {t("details.synopsis")}
            </h3>
            <p className="text-sm leading-relaxed text-neutral-400">
              {movie.longDescription}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant="secondary"
              className="border-0 bg-neutral-800 text-xs text-neutral-300"
            >
              <Star className="mr-1 size-3" />
              {movie.rating}
            </Badge>
            <Badge
              variant="secondary"
              className="border-0 bg-neutral-800 text-xs text-neutral-300"
            >
              <Clock className="mr-1 size-3" />
              {movie.duration}
            </Badge>
            <Badge
              variant="secondary"
              className="border-0 bg-neutral-800 text-xs text-neutral-300"
            >
              {translateGenre(movie.genre, lang)}
            </Badge>
            <Badge
              variant="secondary"
              className="border-0 bg-neutral-800 text-xs text-neutral-300"
            >
              <Languages className="mr-1 size-3" />
              {movie.language.map((language) => displayLanguage(language, lang)).join(", ")}
            </Badge>
            <Badge
              variant="secondary"
              className="border-0 bg-neutral-800 text-xs text-neutral-300"
            >
              <Subtitles className="mr-1 size-3" />
              {movie.subtitles.map((language) => displayLanguage(language, lang)).join(", ")}
            </Badge>
          </div>

          {movie.seasons && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-sm text-neutral-300">
                {t("details.seasonsEpisodes", { seasons: movie.seasons, episodes: movie.episodes || 0 })}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
