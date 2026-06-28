"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import MovieCard from "@/components/MovieCard"
import {
  posterUrl,
  backdropUrl,
  getGenreGradient,
  isPlayableMovie,
} from "@/lib/data"
import type { Movie } from "@/lib/data"
import { fetchCreativeCredits, fetchTvEpisodeGroupSeasons, fetchTvSeasonEpisodes, IMG_URL } from "@/lib/tmdb"
import type { TMDbCast, TMDbCreativeCredits, TMDbEpisodeGroupSeason } from "@/lib/tmdb"
import { useI18n } from "@/i18n/I18nProvider"
import { displayLanguage, translateGenre } from "@/i18n/translations"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Heart,
  Star,
  Clock,
  Languages,
  Subtitles,
  Check,
  Clapperboard,
  Building2,
  UserRound,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

function runtimeStr(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${m}m`
}

interface MovieDetailPageProps {
  movie: Movie
  related: Movie[]
  onBack: () => void
  onPlay: (movie: Movie) => void
  onMovieClick: (movie: Movie) => void
}

export default function MovieDetailPage({
  movie,
  related,
  onBack,
  onPlay,
  onMovieClick,
}: MovieDetailPageProps) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const { lang, t } = useI18n()
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [cast, setCast] = useState<TMDbCast[]>([])
  const [creativeCredits, setCreativeCredits] = useState<TMDbCreativeCredits | null>(null)
  const [tmdbEpisodesBySeason, setTmdbEpisodesBySeason] = useState<Record<number, Movie[]>>({})
  const [tmdbEpisodeGroupSeasons, setTmdbEpisodeGroupSeasons] = useState<{ season: number; title: string; episodes: Movie[] }[]>([])
  const [tmdbEpisodesLoading, setTmdbEpisodesLoading] = useState(false)
  const [castReady, setCastReady] = useState(false)

  useEffect(() => {
    setSelectedSeason(1)
  }, [movie.id])

  useEffect(() => {
    setCastReady(false)
    setCast([])
    setCreativeCredits(null)
    setTmdbEpisodesBySeason({})
    setTmdbEpisodeGroupSeasons([])
    if (!movie.tmdbId) return
    let cancelled = false
    const tmdbType = movie.type === "series" || movie.type === "anime" ? "tv" : "movie"
    fetchCreativeCredits(movie.tmdbId, tmdbType, lang).then((data) => {
      if (cancelled) return
      setCast(data.cast)
      setCreativeCredits(data)
      // One rAF so the DOM node exists before we trigger the CSS animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setCastReady(true)
        })
      })
    })
    return () => {
      cancelled = true
    }
  }, [movie.tmdbId, movie.type, lang])

  const tmdbSeasonList = useMemo(
    () => {
      const detailSeasons = (creativeCredits?.detail?.seasons || [])
        .filter((season) => season.season_number > 0 && season.episode_count > 0)
        .map((season) => ({
          season: season.season_number,
          title: season.name,
          episodes: tmdbEpisodesBySeason[season.season_number] || [],
        }))

      if (detailSeasons.length > 0) return detailSeasons

      const seasonCount = creativeCredits?.detail?.number_of_seasons || movie.seasons || 0
      return Array.from({ length: seasonCount }, (_, index) => {
        const season = index + 1
        return {
          season,
          title: `${t("common.season")} ${season}`,
          episodes: tmdbEpisodesBySeason[season] || [],
        }
      })
    },
    [creativeCredits?.detail?.seasons, creativeCredits?.detail?.number_of_seasons, movie.seasons, movie.type, tmdbEpisodesBySeason, t]
  )

  const activeSeasonList = tmdbEpisodeGroupSeasons.length > 0
    ? tmdbEpisodeGroupSeasons
    : movie.seasonList?.length
      ? movie.seasonList
      : tmdbSeasonList
  const activeSeriesEpisodes = movie.seriesEpisodes?.length
    ? movie.seriesEpisodes
    : (activeSeasonList.find((season) => season.season === selectedSeason)?.episodes || [])
  const hasMultipleSeasons = (activeSeasonList?.length || 0) > 1
  const selectedSeasonMeta = activeSeasonList.find((season) => season.season === selectedSeason)
  const seasonOptionLabel = useCallback((season: { season: number; title?: string }) => {
    const fallback = `${t("common.season")} ${season.season}`
    const title = season.title?.trim()
    if (!title || title.toLowerCase() === fallback.toLowerCase()) return fallback
    return `${fallback} - ${title}`
  }, [t])

  const filteredEpisodes = useMemo(() => {
    if (!activeSeriesEpisodes) return activeSeriesEpisodes
    if (!hasMultipleSeasons) return activeSeriesEpisodes
    return activeSeriesEpisodes.filter((ep) => (ep.seasonNumber || 1) === selectedSeason)
  }, [activeSeriesEpisodes, selectedSeason, hasMultipleSeasons])
  const visibleEpisodes = filteredEpisodes || activeSeriesEpisodes || []

  useEffect(() => {
    const firstSeason = activeSeasonList?.[0]?.season
    if (firstSeason && !activeSeasonList.some((season) => season.season === selectedSeason)) {
      setSelectedSeason(firstSeason)
    }
  }, [activeSeasonList, selectedSeason])

  const mapTmdbEpisodes = useCallback((episodes: TMDbEpisodeGroupSeason["episodes"], seasonNumber: number): Movie[] =>
    episodes.map((episode) => ({
      ...movie,
      id: `${movie.id}-season-${seasonNumber}-episode-${episode.episode_number}`,
      title: episode.name || `${t("player.episode", { episode: episode.episode_number })}`,
      description: episode.overview || "",
      longDescription: episode.overview || "",
      duration: episode.runtime ? `${episode.runtime}m` : movie.duration,
      durationSeconds: episode.runtime ? episode.runtime * 60 : undefined,
      rating: Math.round((episode.vote_average || 0) * 10) / 10,
      posterPath: episode.still_path || movie.posterPath,
      backdropPath: episode.still_path || movie.backdropPath,
      episodeNumber: episode.episode_number,
      seasonNumber,
      episodeTitle: episode.name || `${t("player.episode", { episode: episode.episode_number })}`,
      episodeSynopsis: episode.overview || "",
      seriesTitle: movie.title,
    })), [movie, t])

  useEffect(() => {
    if ((movie.type !== "series" && movie.type !== "anime") || movie.seriesEpisodes?.length || movie.tmdbId <= 0) return
    if (!creativeCredits?.detail || tmdbEpisodeGroupSeasons.length > 0) return

    let cancelled = false
    const detailSeasons = (creativeCredits.detail.seasons || [])
      .filter((season) => season.season_number > 0 && season.episode_count > 0)

    fetchTvEpisodeGroupSeasons(
      movie.tmdbId,
      creativeCredits.detail.number_of_episodes || movie.episodes || 0,
      detailSeasons.length,
      lang,
      Object.fromEntries(detailSeasons.map((season) => [season.season_number, season.name]))
    ).then((groupSeasons) => {
      if (cancelled || groupSeasons.length === 0) return
      setTmdbEpisodeGroupSeasons(
        groupSeasons.map((season) => ({
          season: season.season,
          title: season.title,
          episodes: mapTmdbEpisodes(season.episodes, season.season),
        }))
      )
      setSelectedSeason(groupSeasons[0].season)
    })

    return () => {
      cancelled = true
    }
  }, [creativeCredits?.detail, mapTmdbEpisodes, movie.episodes, movie.seriesEpisodes?.length, movie.tmdbId, movie.type, tmdbEpisodeGroupSeasons.length])

  useEffect(() => {
    if ((movie.type !== "series" && movie.type !== "anime") || movie.seriesEpisodes?.length || movie.tmdbId <= 0) return
    if (tmdbEpisodeGroupSeasons.length > 0) return
    const seasonNumber = selectedSeason || tmdbSeasonList[0]?.season || 1
    if (!seasonNumber || tmdbEpisodesBySeason[seasonNumber]) return

    let cancelled = false
    setTmdbEpisodesLoading(true)
    fetchTvSeasonEpisodes(movie.tmdbId, seasonNumber, lang)
      .then((episodes) => {
        if (cancelled) return
        const mappedEpisodes = mapTmdbEpisodes(episodes, seasonNumber)
        setTmdbEpisodesBySeason((previous) => ({
          ...previous,
          [seasonNumber]: mappedEpisodes,
        }))
      })
      .finally(() => {
        if (!cancelled) setTmdbEpisodesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mapTmdbEpisodes, movie.seriesEpisodes?.length, movie.tmdbId, movie.type, selectedSeason, tmdbEpisodeGroupSeasons.length, tmdbEpisodesBySeason, tmdbSeasonList, lang])

  const bgSrc = backdropUrl(movie.backdropPath, "original")
  const posterSrc = posterUrl(movie.posterPath, "w500")
  const detailMovie = creativeCredits?.trailerUrl
    ? { ...movie, trailerUrl: creativeCredits.trailerUrl }
    : movie
  const canPlay = isPlayableMovie(detailMovie)
  const detailRuntime = creativeCredits?.detail?.runtime
    || creativeCredits?.detail?.episode_run_time?.find((minutes) => minutes > 0)
    || creativeCredits?.detail?.last_episode_to_air?.runtime
  const visibleDuration = movie.duration && movie.duration !== "-"
    ? movie.duration
    : runtimeStr(detailRuntime)
  const creativeCards = useMemo(() => {
    const credits = creativeCredits
    if (!credits) return []

    const uniqueNames = (items: string[]) => [...new Set(items.filter(Boolean))]
    const directors = uniqueNames(
      credits.crew
        .filter((person) =>
          ["Director", "Series Director", "Episode Director", "Co-Director"].includes(person.job)
        )
        .map((person) => person.name)
    ).slice(0, 2)
    const creators = uniqueNames([
      ...(credits.detail?.created_by || []).map((person) => person.name),
      ...credits.crew
        .filter((person) =>
          ["Creator", "Original Creator", "Story", "Screenplay", "Writer"].includes(person.job)
        )
        .map((person) => person.name),
    ]).slice(0, 2)
    const studios = uniqueNames([
      ...(credits.detail?.production_companies || []).map((company) => company.name),
      ...(credits.detail?.networks || []).map((network) => network.name),
    ]).slice(0, 2)

    const cards: {
      key: string
      title: string
      icon: typeof UserRound
      items: string[]
      badgeClassName: string
    }[] = []
    if (directors.length > 0) {
      cards.push({
        key: "directors",
        title: movie.type === "movie" ? t("details.directors") : t("details.direction"),
        icon: UserRound,
        items: directors,
        badgeClassName: "bg-white/10 text-white",
      })
    }
    if (creators.length > 0) {
      cards.push({
        key: "creators",
        title: t("details.creators"),
        icon: Clapperboard,
        items: creators,
        badgeClassName: "bg-neutral-800 text-neutral-200",
      })
    }
    if (studios.length > 0) {
      cards.push({
        key: "studios",
        title: movie.type === "anime" ? t("details.animationStudios") : t("details.studios"),
        icon: Building2,
        items: studios,
        badgeClassName: "bg-neutral-800 text-neutral-200",
      })
    }
    return cards
  }, [creativeCredits, movie.type, t])

  return (
    <div className="min-h-screen bg-black">
      {/* Back button */}
      <div className="fixed top-0 right-0 left-0 z-40 bg-gradient-to-b from-black/80 to-transparent py-4 pl-4 animate-fade-in sm:pl-6">
        <Button
          variant="ghost"
          size="icon"
          className="text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95"
          onClick={onBack}
        >
          <ChevronLeft className="size-6" />
        </Button>
      </div>

      {/* Hero backdrop section */}
      <section className="relative min-h-[60vh] w-full overflow-hidden sm:min-h-[70vh]">
        {bgSrc ? (
          <img
            src={bgSrc}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover object-top will-change-transform ${
              imgLoaded ? "opacity-40 animate-ken-burns" : "opacity-0"
            }`}
            style={{ transition: imgLoaded ? undefined : "opacity 1s ease" }}
            onLoad={() => setImgLoaded(true)}
          />
        ) : posterSrc ? (
          <img
            src={posterSrc}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover object-top will-change-transform ${
              imgLoaded ? "opacity-30 animate-ken-burns" : "opacity-0"
            }`}
            style={{ transition: imgLoaded ? undefined : "opacity 1s ease" }}
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <div
            className={`absolute inset-0 bg-gradient-to-b ${getGenreGradient(movie.genre)} opacity-60`}
          />
        )}
        {/* Bottom-to-top gradient (content readability) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        {/* Top gradient — always dark so the back button is always readable */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-black/80 to-transparent" />

        {/* Content */}
        <div className="relative z-10 mx-auto flex h-full min-h-[60vh] max-w-[1920px] items-end pt-16 sm:min-h-[70vh]">
          <div className="flex w-full gap-6 px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
            {/* Poster */}
            {posterSrc && (
              <div className="hidden w-48 shrink-0 animate-fade-up stagger-1 sm:block md:w-56">
                <div className="aspect-[2/3] w-full overflow-hidden rounded-xl shadow-2xl">
                  <img
                    src={posterSrc}
                    alt={movie.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Info */}
            <div className="flex flex-col justify-end gap-4">
              <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-white drop-shadow-lg animate-fade-up stagger-2 sm:text-4xl md:text-5xl">
                {movie.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400 animate-fade-up stagger-3">
                <span className="text-white/80">{movie.year}</span>
                <span className="h-4 w-px bg-neutral-700" />
                <span>{visibleDuration !== "-" ? visibleDuration : t("common.noAvailable")}</span>
                {movie.quality && (
                  <>
                    <span className="h-4 w-px bg-neutral-700" />
                    <span className="text-neutral-500">{movie.quality}</span>
                  </>
                )}
                <span className="h-4 w-px bg-neutral-700" />
                <span className="text-neutral-500">{translateGenre(movie.genre, lang)}</span>
              </div>

              <div className="flex flex-wrap gap-2 animate-fade-up stagger-4">
                {movie.quality && (
                  <Badge className="border-0 bg-white/10 text-xs text-white backdrop-blur-sm">
                    {movie.quality}
                  </Badge>
                )}
                {movie.language.slice(0, 3).map((l) => (
                  <Badge
                    key={l}
                    variant="outline"
                    className="border-white/10 text-xs text-neutral-300"
                  >
                    {displayLanguage(l, lang)}
                  </Badge>
                ))}
              </div>

              <p className="max-w-2xl text-sm leading-relaxed text-neutral-400 animate-fade-up stagger-5 sm:text-base">
                {movie.longDescription}
              </p>

              {creativeCards.length > 0 && (
                <div className="hide-scrollbar flex w-full max-w-5xl items-start gap-3 overflow-x-auto pb-1 animate-fade-up stagger-5">
                  {creativeCards.map((card) => {
                    const Icon = card.icon
                    return (
                      <div
                        key={card.key}
                        className="h-fit w-max min-w-fit shrink-0 rounded-lg border border-white/10 bg-black/35 p-4 backdrop-blur-md"
                      >
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
                          <Icon className="size-3.5 text-neutral-300" />
                          {card.title}
                        </div>
                        <div className="flex flex-nowrap gap-2">
                          {card.items.map((item) => (
                            <Badge
                              key={item}
                              variant="secondary"
                              className={`h-auto w-max max-w-none justify-start whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[11px] leading-snug ${card.badgeClassName}`}
                            >
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-3 animate-fade-up stagger-6">
                {canPlay && (
                  <Button
                    size="lg"
                    className="gap-2 border-0 bg-white text-black transition-all duration-300 hover:scale-105 hover:bg-neutral-200 active:scale-95"
                    onClick={() => onPlay(detailMovie)}
                  >
                    <Play className="size-5 fill-black" />
                    {t("common.play")}
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  disabled
                  title={t("common.availableSoon")}
                  className="gap-2 border-white/10 text-neutral-500"
                >
                  <Heart className="size-5" />
                  {t("common.favoritesSoon")}
                </Button>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Tags section */}
      <section className="mx-auto max-w-[1920px] px-4 pb-6 animate-fade-up stagger-7 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          {movie.rating > 0 && (
            <Badge
              variant="secondary"
              className="border-0 bg-neutral-800 text-xs text-neutral-300"
            >
              <Star className="mr-1 size-3" />
              {movie.rating}
            </Badge>
          )}
          <Badge
            variant="secondary"
            className="border-0 bg-neutral-800 text-xs text-neutral-300"
          >
            <Clock className="mr-1 size-3" />
            {visibleDuration !== "-" ? visibleDuration : t("common.noAvailable")}
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
            {movie.subtitles.length > 0
              ? movie.subtitles.map((language) => displayLanguage(language, lang)).join(", ")
              : t("common.noAvailable")}
          </Badge>
        </div>
      </section>

      {/* Episodes */}
      {((activeSeriesEpisodes && activeSeriesEpisodes.length > 0) || tmdbEpisodesLoading) && (
        <section className="mx-auto max-w-[1920px] px-4 pb-10 animate-fade-up sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">{t("details.episodes")}</h2>
              {hasMultipleSeasons && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 outline-none transition-colors hover:border-neutral-600 focus:border-neutral-500">
                      {selectedSeasonMeta ? seasonOptionLabel(selectedSeasonMeta) : `${t("common.season")} ${selectedSeason}`}
                      <ChevronDown className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-36 border-neutral-800 bg-neutral-950 text-neutral-300">
                    {activeSeasonList!.map((s, i) => (
                      <div key={s.season}>
                        {i > 0 && <DropdownMenuSeparator className="bg-neutral-800" />}
                        <DropdownMenuItem
                          className="flex items-center gap-2 text-xs cursor-pointer"
                          onClick={() => setSelectedSeason(s.season)}
                        >
                          {selectedSeason === s.season && <Check className="size-3 text-white" />}
                          <span className={selectedSeason === s.season ? "text-white" : ""}>
                            {seasonOptionLabel(s)}
                          </span>
                        </DropdownMenuItem>
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <span className="text-xs text-neutral-500">
              {visibleEpisodes.length} {t("common.episodes")}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tmdbEpisodesLoading && visibleEpisodes.length === 0
              ? Array.from({ length: 6 }).map((_, index) => (
                  <Card
                    key={`episode-loading-${index}`}
                    size="sm"
                    className="border border-neutral-800 bg-neutral-900/50"
                  >
                    <div className="flex gap-3 p-3">
                      <div className="h-24 w-16 shrink-0 animate-pulse rounded-md bg-neutral-800" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-800" />
                        <div className="h-3 w-20 animate-pulse rounded bg-neutral-800" />
                        <div className="h-12 animate-pulse rounded bg-neutral-800/80" />
                      </div>
                    </div>
                  </Card>
                ))
              : visibleEpisodes.map((episode) => {
                  const episodeImage = posterUrl(episode.posterPath || movie.posterPath, "w185")
                  const episodeName = episode.episodeTitle || episode.title
                  const episodeLabel = episode.episodeNumber
                    ? `E${episode.episodeNumber} - ${episodeName}`
                    : episodeName

                  return (
                    <Card
                      key={episode.id}
                      size="sm"
                      className="cursor-pointer border border-neutral-800 bg-neutral-900/50 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
                      onClick={() => onMovieClick(episode)}
                    >
                      <div className="flex gap-3 p-3">
                        <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-neutral-800 shadow-md">
                          {episodeImage ? (
                            <img
                              src={episodeImage}
                              alt={episodeLabel}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className={`h-full w-full bg-gradient-to-b ${getGenreGradient(movie.genre)}`} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <CardTitle className="line-clamp-2 text-sm leading-snug text-white">
                                {episodeLabel}
                              </CardTitle>
                              <CardDescription className="mt-1 text-xs text-neutral-500">
                                {episode.duration && episode.duration !== "-"
                                  ? episode.duration
                                  : t("common.noAvailable")}
                              </CardDescription>
                            </div>
                            {isPlayableMovie(episode) && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onPlay(episode)
                                }}
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
                              >
                                <Play className="size-3.5 fill-black" />
                              </button>
                            )}
                          </div>
                          {(episode.episodeSynopsis || episode.description) && (
                            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-neutral-400">
                              {episode.episodeSynopsis || episode.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
          </div>
        </section>
      )}
      {/* Cast - carousel con botones */}
      {cast.length > 0 && (
        <section
          className="group/row mx-auto max-w-[1920px] px-4 pb-10 sm:px-6 lg:px-8"
          style={{
            opacity: castReady ? 1 : 0,
            transform: castReady ? "translateY(0)" : "translateY(14px)",
            transition: "opacity 400ms cubic-bezier(0,0,0.2,1), transform 400ms cubic-bezier(0,0,0.2,1)",
          }}
        >
          <h2 className="mb-4 text-lg font-semibold text-white">{t("details.cast")}</h2>
          <div className="relative">
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 flex w-12 items-center opacity-0 transition-all duration-500 group-hover/row:opacity-100 sm:pointer-events-auto">
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
              <button
                onClick={() => { const el = document.getElementById("cast-scroll"); if (el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" }) }}
                className="relative z-10 ml-1 flex size-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95"
              >
                <ChevronLeft className="size-5" />
              </button>
            </div>
            <div
              id="cast-scroll"
              className="hide-scrollbar flex flex-nowrap gap-4 overflow-x-auto pb-2 scroll-smooth"
            >
              {cast.map((actor) => (
                <div key={actor.id} className="w-28 shrink-0 snap-start sm:w-32">
                  <div className="mb-2 aspect-[2/3] overflow-hidden rounded-lg bg-neutral-800">
                    {actor.profile_path ? (
                      <img
                        src={`${IMG_URL}/w185${actor.profile_path}`}
                        alt={actor.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-600">
                        <Star className="size-6" />
                      </div>
                    )}
                  </div>
                  <p className="truncate text-xs font-medium text-white">{actor.name}</p>
                  <p className="truncate text-[10px] text-neutral-500">{actor.character}</p>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 flex w-12 items-center justify-end opacity-0 transition-all duration-500 group-hover/row:opacity-100 sm:pointer-events-auto">
              <div className="absolute inset-0 bg-gradient-to-l from-black/70 via-black/30 to-transparent" />
              <button
                onClick={() => { const el = document.getElementById("cast-scroll"); if (el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" }) }}
                className="relative z-10 mr-1 flex size-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="mx-auto max-w-[1920px] px-4 pb-10 animate-fade-up sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-white">
            {movie.type === "movie" ? t("details.related") : movie.type === "anime" ? t("details.similarAnime") : t("details.similarSeries")}
          </h2>
          <div className="hide-scrollbar flex flex-nowrap gap-3 overflow-x-auto pb-2">
            {related.map((item, i) => (
              <div key={item.id} className="w-[140px] shrink-0 sm:w-[160px]">
                <MovieCard
                  movie={item}
                  onPlay={onPlay}
                  onDetails={onMovieClick}
                  index={i}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
