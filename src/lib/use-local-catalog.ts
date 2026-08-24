/* eslint-disable react-hooks/set-state-in-effect */
// Development-only data source: reads the local movie library scanned by
// scripts/local-media-server.mjs (via /api/local-library) and matches each file
// against TMDB just for metadata (poster, backdrop, overview, genres, cast lookups
// stay data-driven through movie.tmdbId). Playback always points at the local file
// through /api/local-video/*, never at a YouTube trailer. Only used when
// import.meta.env.DEV is true — see use-catalog.ts.
import { useCallback, useEffect, useRef, useState } from "react"
import type { Movie, Category } from "@/lib/data"
import { searchMulti, fetchDetail, mapGenres, type TMDbMovie, type TMDbMovieDetail } from "@/lib/tmdb"
import { toMovie, type TMDbState } from "@/lib/use-tmdb"
import { useI18n } from "@/i18n/I18nProvider"
import type { Lang } from "@/i18n/translations"

const VIDEO_API_PREFIX = "/api/local-video/"
const MATCH_CONCURRENCY = 4

interface LocalMovieEntry { id: string; relPath: string; title: string; year: number }
interface LocalEpisodeEntry { id: string; relPath: string; season: number; episode: number; title: string }
interface LocalShowEntry { id: string; title: string; year: number; episodes: LocalEpisodeEntry[] }
interface LocalLibraryResponse {
  movies: LocalMovieEntry[]
  series: LocalShowEntry[]
  animeMovies: LocalMovieEntry[]
  animeSeries: LocalShowEntry[]
  error?: string
}

function localVideoUrl(relPath: string): string {
  return `${VIDEO_API_PREFIX}${encodeURIComponent(relPath)}`
}

// Local files don't have a TMDB id until matched — give unmatched ones a stable
// negative pseudo-id derived from their path so they stay unique and truthy.
function pseudoId(relPath: string): number {
  let hash = 0
  for (let i = 0; i < relPath.length; i++) {
    hash = (hash * 31 + relPath.charCodeAt(i)) | 0
  }
  return -Math.abs(hash) - 1
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

function fallbackTMDbMovie(local: { id: string; title: string; year: number }, mediaType: "movie" | "tv"): TMDbMovie {
  return {
    id: pseudoId(local.id),
    title: local.title,
    name: local.title,
    poster_path: null,
    backdrop_path: null,
    overview: "",
    vote_average: 0,
    release_date: local.year ? `${local.year}-01-01` : "",
    first_air_date: local.year ? `${local.year}-01-01` : "",
    genre_ids: [],
    original_language: "",
    popularity: 0,
    media_type: mediaType,
  }
}

async function findTmdbMatch(title: string, year: number, mediaType: "movie" | "tv", lang: Lang): Promise<TMDbMovie | null> {
  try {
    const results = await searchMulti(title, 1, lang)
    const candidates = results.filter((item) => (item.media_type || "movie") === mediaType)
    if (candidates.length === 0) return null
    if (year) {
      const dated = candidates.find((item) => {
        const date = item.release_date || item.first_air_date || ""
        return date.startsWith(String(year))
      })
      if (dated) return dated
    }
    return candidates[0]
  } catch {
    return null
  }
}

async function buildMovie(
  local: LocalMovieEntry,
  type: Movie["type"],
  lang: Lang,
  translate: (key: string) => string
): Promise<Movie> {
  const mediaType = "movie"
  const match = await findTmdbMatch(local.title, local.year, mediaType, lang)
  let detail: TMDbMovieDetail | null = null
  let genreNames = ""
  if (match) {
    try {
      detail = await fetchDetail(match.id, mediaType, lang)
      genreNames = (detail.genres || []).map((g) => g.name).join(", ")
    } catch {
      detail = null
    }
  }
  const item = match || fallbackTMDbMovie(local, mediaType)
  const movie = toMovie(
    item,
    detail,
    genreNames,
    type,
    0,
    localVideoUrl(local.relPath),
    translate("movie.unknown"),
    translate("movie.fallback"),
    translate("common.general"),
    lang
  )
  return { ...movie, year: local.year || movie.year }
}

function buildEpisodeMovie(parent: Movie, ep: LocalEpisodeEntry): Movie {
  return {
    ...parent,
    id: `${parent.id}-s${ep.season}e${ep.episode}`,
    episodeTitle: ep.title,
    episodeNumber: ep.episode,
    seasonNumber: ep.season,
    trailerUrl: localVideoUrl(ep.relPath),
    seriesEpisodes: undefined,
    seasonList: undefined,
  }
}

async function buildShow(
  local: LocalShowEntry,
  type: Movie["type"],
  lang: Lang,
  translate: (key: string) => string
): Promise<Movie> {
  const mediaType = "tv"
  const match = await findTmdbMatch(local.title, local.year, mediaType, lang)
  let detail: TMDbMovieDetail | null = null
  let genreNames = ""
  if (match) {
    try {
      detail = await fetchDetail(match.id, mediaType, lang)
      genreNames = (detail.genres || []).map((g) => g.name).join(", ")
    } catch {
      detail = null
    }
  }
  const item = match || fallbackTMDbMovie(local, mediaType)
  const base = toMovie(
    item,
    detail,
    genreNames,
    type,
    0,
    undefined,
    translate("movie.unknown"),
    translate("movie.fallback"),
    translate("common.general"),
    lang
  )
  const withYear = { ...base, year: local.year || base.year }
  const seriesEpisodes = local.episodes.map((ep) => buildEpisodeMovie(withYear, ep))
  const seasons = [...new Set(local.episodes.map((ep) => ep.season))].sort((a, b) => a - b)
  const seasonList = seasons.map((season) => ({
    season,
    title: `${translate("common.season")} ${season}`,
    episodes: [],
  }))
  return {
    ...withYear,
    seasons: seasons.length,
    totalSeasons: seasons.length,
    episodes: local.episodes.length,
    seriesEpisodes,
    seasonList,
  }
}

function pickHero(movies: Movie[]): Movie | null {
  const withBackdrop = movies.filter((m) => m.backdropPath || m.posterPath)
  const pool = withBackdrop.length > 0 ? withBackdrop : movies
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export function useLocalCatalog(): TMDbState {
  const { lang, t: translate } = useI18n()
  const [hero, setHero] = useState<Movie | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [allMovies, setAllMovies] = useState<Movie[]>([])
  const [movies, setMovies] = useState<Movie[]>([])
  const [series, setSeries] = useState<Movie[]>([])
  const [anime, setAnime] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef<Lang | null>(null)

  useEffect(() => {
    if (fetched.current === lang) return
    fetched.current = lang
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      const res = await fetch("/api/local-library")
      const library: LocalLibraryResponse = await res.json()
      if (cancelled) return
      if (library.error && library.movies.length === 0 && library.series.length === 0) {
        setError(library.error)
        setLoading(false)
        return
      }

      const [moviesBuilt, seriesBuilt, animeMoviesBuilt, animeSeriesBuilt] = await Promise.all([
        mapWithConcurrency(library.movies, MATCH_CONCURRENCY, (m) => buildMovie(m, "movie", lang, translate)),
        mapWithConcurrency(library.series, MATCH_CONCURRENCY, (s) => buildShow(s, "series", lang, translate)),
        mapWithConcurrency(library.animeMovies, MATCH_CONCURRENCY, (m) => buildMovie(m, "anime", lang, translate)),
        mapWithConcurrency(library.animeSeries, MATCH_CONCURRENCY, (s) => buildShow(s, "anime", lang, translate)),
      ])
      if (cancelled) return

      const animeAll = [...animeMoviesBuilt, ...animeSeriesBuilt]
      const all = [...moviesBuilt, ...seriesBuilt, ...animeAll]
      const heroMovie = pickHero(moviesBuilt.length > 0 ? moviesBuilt : all)

      setHero(heroMovie)
      setCategories([
        { title: translate("common.movies"), items: moviesBuilt.slice(0, 20) },
        { title: translate("common.series"), items: seriesBuilt.slice(0, 20) },
        { title: translate("common.anime"), items: animeAll.slice(0, 20) },
      ])
      setMovies(moviesBuilt)
      setSeries(seriesBuilt)
      setAnime(animeAll)
      setAllMovies(all)
      setLoading(false)
    })().catch((err) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : translate("tmdb.loadError"))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [lang, translate])

  const search = useCallback(
    async (query: string): Promise<Movie[]> => {
      const trimmed = query.trim().toLowerCase()
      if (!trimmed) return []
      return allMovies.filter((movie) => movie.title.toLowerCase().includes(trimmed))
    },
    [allMovies]
  )

  // Anything reached from outside the local library (e.g. a filmography credit on
  // an actor page) is purely informational — pull it straight from TMDB rather than
  // requiring a matching local file, same as production TMDB mode does.
  const loadDetail = useCallback(
    async (tmdbId: number, type: Movie["type"]): Promise<Movie | null> => {
      const local = allMovies.find((movie) => movie.tmdbId === tmdbId && movie.type === type)
      if (local) return local
      const mediaType = type === "series" || type === "anime" ? "tv" : "movie"
      try {
        const detail = await fetchDetail(tmdbId, mediaType, lang)
        const genreNames = await mapGenres((detail.genres || []).map((g) => g.id), lang)
        const item: TMDbMovie = {
          id: tmdbId,
          title: detail.title,
          name: detail.name,
          poster_path: detail.poster_path,
          backdrop_path: detail.backdrop_path,
          overview: detail.overview,
          vote_average: detail.vote_average,
          release_date: detail.release_date,
          first_air_date: detail.first_air_date,
          genre_ids: [],
          original_language: "",
          popularity: detail.popularity,
          media_type: mediaType,
        }
        return toMovie(
          item,
          detail,
          genreNames,
          type,
          0,
          undefined,
          translate("movie.unknown"),
          translate("movie.fallback"),
          translate("common.general"),
          lang
        )
      } catch {
        return null
      }
    },
    [allMovies, lang, translate]
  )

  return {
    hero,
    categories,
    allMovies,
    movies,
    series,
    anime,
    loading,
    error,
    search,
    loadDetail,
    trendingTmdbIds: new Set<number>(),
  }
}
