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
import { Play, Star, Clock, Languages, Subtitles } from "lucide-react"
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
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto border-neutral-800 bg-neutral-950 p-0 text-white sm:w-full">
        {/* Banner */}
        <div className="relative h-56 w-full overflow-hidden sm:h-80">
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
          <div className="absolute right-0 bottom-0 left-0 p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="line-clamp-3 text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">
                {movie.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("details.label", { title: movie.title })}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-5 px-4 pb-5 sm:space-y-6 sm:px-6 sm:pb-6">
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

          <div className="flex flex-wrap gap-2 sm:gap-3">
            {canPlay && (
              <Button
                className="h-9 gap-2 border-0 bg-white px-4 text-sm text-black hover:bg-neutral-200 sm:h-10"
                onClick={() => {
                  onPlay?.(movie)
                  onOpenChange(false)
                }}
              >
                <Play className="size-4 fill-black" />
                {t("common.play")}
              </Button>
            )}
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
              className="max-w-full whitespace-normal border-0 bg-neutral-800 text-left text-xs text-neutral-300"
            >
              {translateGenre(movie.genre, lang)}
            </Badge>
            <Badge
              variant="secondary"
              className="max-w-full whitespace-normal border-0 bg-neutral-800 text-left text-xs text-neutral-300"
            >
              <Languages className="mr-1 size-3" />
              {movie.language.map((language) => displayLanguage(language, lang)).join(", ")}
            </Badge>
            <Badge
              variant="secondary"
              className="max-w-full whitespace-normal border-0 bg-neutral-800 text-left text-xs text-neutral-300"
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


