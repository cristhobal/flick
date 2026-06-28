"use client"

import { Check, Star } from "lucide-react"
import type { Movie } from "@/lib/data"
import { posterUrl } from "@/lib/data"

interface FavoriteToastProps {
  movie: Movie
  title: string
  genreFallback: string
  typeLabel: string
}

export default function FavoriteToast({
  movie,
  title,
  genreFallback,
  typeLabel,
}: FavoriteToastProps) {
  const poster = posterUrl(movie.posterPath, "w185")
  const genres = movie.genre
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ") || genreFallback
  const hasRating = Number.isFinite(movie.rating) && movie.rating > 0
  const hasDuration = Boolean(movie.duration && movie.duration !== "-")

  return (
    <div className="relative isolate w-[min(410px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-white/10 bg-neutral-950 text-white shadow-[0_22px_70px_rgba(0,0,0,0.55)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
      <div className="pointer-events-none absolute -top-20 right-0 h-36 w-36 rounded-full bg-white/[0.035] blur-3xl" />

      <div className="flex min-w-0 items-stretch gap-4 p-3.5">
        <div className="relative aspect-[2/3] w-[72px] shrink-0 overflow-hidden rounded-md bg-neutral-900 ring-1 ring-white/10">
        {poster ? (
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900">
            <Star className="size-5 text-neutral-500" />
          </div>
        )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col py-0.5">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-black">
                <Check className="size-3.5" />
              </span>
              <span className="truncate">{title}</span>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
              {typeLabel}
            </span>
          </div>

          <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-white">
            {movie.title}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
            {movie.year > 0 && <span>{movie.year}</span>}
            {movie.year > 0 && (hasDuration || hasRating) && <span className="size-1 rounded-full bg-neutral-700" />}
            {hasDuration && <span>{movie.duration}</span>}
            {hasDuration && hasRating && <span className="size-1 rounded-full bg-neutral-700" />}
            {hasRating && (
              <span className="inline-flex items-center gap-1 text-neutral-300">
                <Star className="size-3 fill-white text-white" />
                {movie.rating}
              </span>
            )}
          </div>

          <p className="mt-2 line-clamp-1 text-xs leading-relaxed text-neutral-500">
            {genres}
          </p>
        </div>
      </div>
    </div>
  )
}
