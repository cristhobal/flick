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
      <div className="relative h-[56vw] max-h-[78vh] min-h-[360px] bg-zinc-950">
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
            <div className="relative z-10 max-w-xl px-6 text-center">
              <Play className="mx-auto mb-4 h-12 w-12 text-white/80" />
              <h1 className="text-3xl font-bold">{title}</h1>
              <p className="mt-3 text-sm text-white/70">{t("common.noAvailable")}</p>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          className="absolute left-4 top-4 z-20 bg-black/45 text-white hover:bg-black/70 hover:text-white"
          onClick={onBack}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/45">{t("player.trailer")}</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">{title}</h1>
          {movie.description && (
            <p className="mt-4 text-sm leading-6 text-white/70 md:text-base">{movie.description}</p>
          )}
        </div>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-semibold">{t("player.related")}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
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
