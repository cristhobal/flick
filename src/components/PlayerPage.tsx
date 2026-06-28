import { Button } from "@/components/ui/button"
import MovieCard from "@/components/MovieCard"
import type { Movie } from "@/lib/data"
import { backdropUrl, posterUrl } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { ChevronLeft, Play } from "lucide-react"

export default function PlayerPage({
  movie,
  related,
  onBack,
  onPlayMovie,
}: PlayerPageProps) {
  const { t } = useI18n()
  const title = movie.seriesTitle || movie.title
  const image = backdropUrl(movie.backdropPath) || posterUrl(movie.posterPath)
  const trailerUrl = movie.trailerUrl || ""

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Video player — 16:9 ratio with safe bounds */}
      <div className="relative h-[clamp(220px,56.25vw,80svh)] w-full bg-zinc-950">
        <div className="absolute inset-0">
          {trailerUrl ? (
            <iframe
              key={trailerUrl}
              src={trailerUrl}
              title={title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="relative flex h-full items-center justify-center overflow-hidden">
              {image && (
                <img
                  src={image}
                  alt={title}
                  className="absolute inset-0 h-full w-full object-cover opacity-35 blur-sm"
                />
              )}
              <div className="relative z-10 max-w-sm px-4 text-center sm:max-w-xl sm:px-6">
                <Play className="mx-auto mb-4 size-10 text-white/80 sm:size-12" />
                <h1 className="text-balance text-xl font-bold sm:text-3xl">{title}</h1>
                <p className="mt-3 text-sm text-white/70">{t("common.noAvailable")}</p>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="absolute left-3 top-3 z-20 bg-black/45 text-white hover:bg-black/70 hover:text-white sm:left-4 sm:top-4"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      <div className="content-container py-6 sm:py-8">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45 sm:text-sm">{t("player.trailer")}</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl md:text-4xl">{title}</h1>
          {movie.description && (
            <p className="mt-3 text-sm leading-6 text-white/70 sm:mt-4 md:text-base">{movie.description}</p>
          )}
        </div>

        {related.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <h2 className="mb-4 text-lg font-semibold sm:text-xl">{t("player.related")}</h2>
            <div className="responsive-card-grid">
              {related.slice(0, 12).map((item) => (
                <MovieCard
                  key={item.id}
                  movie={item}
                  onDetails={onPlayMovie}
                  onPlay={onPlayMovie}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

interface PlayerPageProps {
  movie: Movie
  related: Movie[]
  episodes: Movie[]
  onBack: () => void
  onPlayMovie?: (movie: Movie) => void
}
