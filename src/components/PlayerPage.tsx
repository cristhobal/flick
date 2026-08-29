import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import LocalVideoPlayer from "@/components/LocalVideoPlayer"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Movie } from "@/lib/data"
import { backdropUrl, posterUrl } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { ChevronLeft, ListVideo, Play, RotateCcw } from "lucide-react"

// A single "next episode" / "previous episode" row: a wide thumbnail with a
// duration/status badge, the episode title, and a hover overlay icon.
function EpisodeFeatureRow({
  episode,
  label,
  badge,
  icon,
  onClick,
}: {
  episode: Movie
  label: string
  badge: string | null
  icon: "play" | "watched"
  onClick: () => void
}) {
  const image = posterUrl(episode.posterPath, "w185") || backdropUrl(episode.backdropPath, "w780")
  const synopsis = episode.episodeSynopsis || episode.description || ""
  return (
    <button
      onClick={onClick}
      className="group flex w-full cursor-pointer items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-white/[0.05]"
    >
      <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-neutral-800">
        {image && <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
          {icon === "play" ? (
            <Play className="size-5 fill-white text-white" />
          ) : (
            <RotateCcw className="size-5 text-white" />
          )}
        </div>
        {badge && (
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {badge}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-white">{label}</p>
        {synopsis && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">{synopsis}</p>
        )}
      </div>
    </button>
  )
}

export default function PlayerPage({
  movie,
  episodes,
  seriesId,
  onBack,
  onPlayMovie,
}: PlayerPageProps) {
  const { t } = useI18n()
  const title = movie.seriesTitle || movie.title
  const image = backdropUrl(movie.backdropPath) || posterUrl(movie.posterPath)
  const trailerUrl = movie.trailerUrl || ""
  const isLocalVideo = trailerUrl.startsWith("/api/local-video/")

  // Ordered episode list for this playthrough — drives both the "up next" side
  // panel (any series/anime) and the local player's autoplay-on-end card (local
  // playback only, see nextEpisode below).
  const sortedEpisodes = useMemo(() => {
    if (movie.type !== "series" && movie.type !== "anime") return []
    if (!episodes || episodes.length === 0) return []
    return [...episodes].sort((a, b) => {
      const seasonDiff = (a.seasonNumber || 0) - (b.seasonNumber || 0)
      if (seasonDiff !== 0) return seasonDiff
      return (a.episodeNumber || 0) - (b.episodeNumber || 0)
    })
  }, [movie.type, episodes])

  const currentEpisodeIndex = useMemo(
    () => sortedEpisodes.findIndex((episode) => episode.id === movie.id),
    [sortedEpisodes, movie.id]
  )
  const previousEpisode = currentEpisodeIndex > 0 ? sortedEpisodes[currentEpisodeIndex - 1] : null
  const upcomingEpisodes = useMemo(
    () => (currentEpisodeIndex !== -1 ? sortedEpisodes.slice(currentEpisodeIndex + 1) : []),
    [sortedEpisodes, currentEpisodeIndex]
  )
  const featuredNextEpisode = upcomingEpisodes[0] || null

  // Next episode in the closing seconds / on end — only meaningful for a real local
  // playthrough of a series/anime, never for the TMDB trailer iframe path.
  const nextEpisode = isLocalVideo && featuredNextEpisode?.trailerUrl ? featuredNextEpisode : null

  // Every season present across this playthrough's episodes — drives the season
  // picker in the expanded episode list, and whether the next/previous rows need
  // to spell out a season number (a plain "E1" is ambiguous once there's more
  // than one season).
  const seasonNumbers = useMemo(
    () => [...new Set(sortedEpisodes.map((episode) => episode.seasonNumber || 1))].sort((a, b) => a - b),
    [sortedEpisodes]
  )
  const hasMultipleSeasons = seasonNumbers.length > 1

  const episodeLabel = (episode: Movie) => {
    const episodePart = episode.episodeNumber ? `E${episode.episodeNumber}` : ""
    const prefix = hasMultipleSeasons && episode.seasonNumber ? `T${episode.seasonNumber} · ${episodePart}` : episodePart
    const name = episode.episodeTitle || episode.title
    return prefix ? `${prefix} – ${name}` : name
  }

  // The full episode list, expanded, is collapsed behind "show more episodes" and
  // grouped by season. Both reset whenever the episode being watched changes
  // (PlayerPage stays mounted across episode switches) — adjusted during render,
  // React's documented pattern for resetting state on a prop change, rather than
  // in an effect (which would cost an extra cascading render).
  const [episodesExpanded, setEpisodesExpanded] = useState(false)
  const [seasonOverride, setSeasonOverride] = useState<number | null>(null)
  const [resetForId, setResetForId] = useState(movie.id)
  if (movie.id !== resetForId) {
    setResetForId(movie.id)
    setEpisodesExpanded(false)
    setSeasonOverride(null)
  }
  const activeSeason = seasonOverride ?? movie.seasonNumber ?? seasonNumbers[0] ?? 1
  const activeSeasonEpisodes = useMemo(
    () => sortedEpisodes.filter((episode) => (episode.seasonNumber || 1) === activeSeason),
    [sortedEpisodes, activeSeason]
  )

  return (
    <div className="relative min-h-screen bg-black text-white">
      {/* Section backdrop — the title's artwork, blurred and dimmed, behind the
          player and the info below it, fading to black (like the detail hero)
          instead of a flat black page. */}
      {image && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[min(95svh,960px)] overflow-hidden">
          <img src={image} alt="" aria-hidden className="h-full w-full scale-110 object-cover opacity-70 blur-xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black" />
        </div>
      )}

      {/* Video player — 16:9 ratio with safe bounds */}
      <div className="relative z-10 h-[clamp(220px,56.25vw,80svh)] w-full">
        <div className="absolute inset-0">
          {trailerUrl && isLocalVideo ? (
            <LocalVideoPlayer
              key={trailerUrl}
              src={trailerUrl}
              title={title}
              media={movie}
              nextEpisode={nextEpisode}
              onPlayNext={onPlayMovie}
              contentId={movie.id}
              seriesId={movie.episodeNumber ? seriesId : undefined}
              prefsKey={(movie.episodeNumber && seriesId) ? seriesId : movie.id}
            />
          ) : trailerUrl ? (
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

      <div className="content-container relative z-10 py-6 sm:py-8">
        <div className={sortedEpisodes.length > 0 ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]" : undefined}>
          <div className="min-w-0">
            {/* Movies (no episode panel) get the full content width; series/anime
                keep this column capped so it doesn't crowd the episode panel. */}
            <div className={sortedEpisodes.length > 0 ? "max-w-3xl" : undefined}>
              {movie.episodeNumber ? (
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45 sm:text-sm">{title}</p>
              ) : !isLocalVideo && (
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45 sm:text-sm">{t("player.trailer")}</p>
              )}
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl md:text-4xl">
                {movie.episodeNumber
                  ? `E ${movie.episodeNumber} - ${movie.episodeTitle || movie.title}`
                  : title}
              </h1>
              {(movie.episodeSynopsis || movie.description) && (
                <p className="mt-3 text-sm leading-6 text-white/70 sm:mt-4 md:text-base">
                  {movie.episodeSynopsis || movie.description}
                </p>
              )}
            </div>
          </div>

          {sortedEpisodes.length > 0 && (
            <aside className="min-w-0 self-start">
              {featuredNextEpisode && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    {t("player.next")}
                  </p>
                  <EpisodeFeatureRow
                    episode={featuredNextEpisode}
                    label={episodeLabel(featuredNextEpisode)}
                    badge={featuredNextEpisode.duration && featuredNextEpisode.duration !== "-" ? featuredNextEpisode.duration : null}
                    icon="play"
                    onClick={() => onPlayMovie?.(featuredNextEpisode)}
                  />
                </div>
              )}

              {previousEpisode && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    {t("player.previous")}
                  </p>
                  <EpisodeFeatureRow
                    episode={previousEpisode}
                    label={episodeLabel(previousEpisode)}
                    badge={t("player.watched")}
                    icon="watched"
                    onClick={() => onPlayMovie?.(previousEpisode)}
                  />
                </div>
              )}

              {sortedEpisodes.length > 1 && (
                <button
                  onClick={() => setEpisodesExpanded((value) => !value)}
                  className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/15 py-2.5 text-xs font-semibold tracking-wide text-white/75 uppercase transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  <ListVideo className="size-4" />
                  {episodesExpanded ? t("player.showLessEpisodes") : t("player.showMoreEpisodes")}
                </button>
              )}

              {sortedEpisodes.length > 1 && (
                <div className="collapsible-rows" data-open={episodesExpanded ? "true" : "false"}>
                  <div className="collapsible-rows-inner">
                    <div className="mt-4 border-t border-white/10 pt-4">
                      {hasMultipleSeasons && (
                        <Select value={String(activeSeason)} onValueChange={(value) => setSeasonOverride(Number(value))}>
                          <SelectTrigger className="w-full border-white/15 bg-white/[0.03] text-sm text-white">
                            <SelectValue>{t("common.season")} {activeSeason}</SelectValue>
                          </SelectTrigger>
                          <SelectContent className="border-neutral-800 bg-neutral-950 text-neutral-300">
                            {seasonNumbers.map((season) => (
                              <SelectItem key={season} value={String(season)} className="text-sm focus:bg-neutral-800 focus:text-white">
                                {t("common.season")} {season}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto pr-1">
                        {activeSeasonEpisodes.map((episode) => {
                          const isCurrent = episode.id === movie.id
                          const episodeImage = posterUrl(episode.posterPath, "w185") || backdropUrl(episode.backdropPath, "w780")
                          const episodeSynopsis = episode.episodeSynopsis || episode.description || ""
                          return (
                            <button
                              key={episode.id}
                              onClick={() => onPlayMovie?.(episode)}
                              className={`group flex w-full cursor-pointer items-start gap-2.5 rounded-lg p-1.5 text-left transition-colors ${
                                isCurrent ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                              }`}
                            >
                              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-neutral-800">
                                {episodeImage && (
                                  <img src={episodeImage} alt="" loading="lazy" className="h-full w-full object-cover" />
                                )}
                                {!isCurrent && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Play className="size-4 fill-white text-white" />
                                  </div>
                                )}
                                {episode.duration && episode.duration !== "-" && (
                                  <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-white">
                                    {episode.duration}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                {isCurrent && (
                                  <span className="mb-1.5 inline-block rounded bg-white px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-black uppercase">
                                    {t("player.nowPlaying")}
                                  </span>
                                )}
                                <p className="line-clamp-2 text-xs font-medium text-white/90">
                                  {episode.episodeNumber ? `E${episode.episodeNumber} – ` : ""}
                                  {episode.episodeTitle || episode.title}
                                </p>
                                {episodeSynopsis && (
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/45">{episodeSynopsis}</p>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

interface PlayerPageProps {
  movie: Movie
  episodes: Movie[]
  seriesId?: string
  onBack: () => void
  onPlayMovie?: (movie: Movie) => void
}
