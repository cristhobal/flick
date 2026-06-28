/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback, useRef } from "react"
import type { Movie, Category } from "@/lib/data"
import {
  fetchTrending,
  fetchPopular,
  fetchNowPlaying,
  fetchTopRated,
  discoverByGenre,
  fetchAnime,
  fetchAnimeByGenre,
  fetchAnimeTopRated,
  fetchTvTopRated,
  fetchTvTrending,
  fetchTrendingAll,
  fetchDetail,
  fetchDetailWithVideos,
  fetchTvEpisodeGroupSeasons,
  mapGenres,
  fetchGenres,
  searchMulti,
  type TMDbMovie,
  type TMDbMovieDetail,
} from "@/lib/tmdb"
import { useI18n } from "@/i18n/I18nProvider"
import { displayLanguage, translateGenre, type Lang } from "@/i18n/translations"

const QUALITIES = ["4K", "1080p", "4K HDR", "1080p HDR", "720p"]
const MAX_PAGES = 2
const DETAIL_CONCURRENCY = 4
const FETCH_CONCURRENCY = 4  // max parallel endpoint fetches to avoid rate limiting
const PAGES_PER_ENDPOINT = 1
const INITIAL_PAGES = 1

function runtimeStr(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${m}m`
}

function detailRuntime(detail: TMDbMovieDetail | null): number | null {
  if (!detail) return null
  if (detail.runtime && detail.runtime > 0) return detail.runtime
  const episodeRuntime = detail.episode_run_time?.find((minutes) => minutes > 0)
  if (episodeRuntime) return episodeRuntime
  const lastEpisodeRuntime = detail.last_episode_to_air?.runtime
  return lastEpisodeRuntime && lastEpisodeRuntime > 0 ? lastEpisodeRuntime : null
}

function pickQuality(): string {
  return QUALITIES[Math.floor(Math.random() * QUALITIES.length)]
}

const CONTENT_RATINGS = ["+7", "+13", "+14", "+16", "+18", "R", "PG-13", "TV-MA", "TV-14"]
function pickContentRating(): string {
  return CONTENT_RATINGS[Math.floor(Math.random() * CONTENT_RATINGS.length)]
}

function releaseTime(item: TMDbMovie): number {
  const date = item.release_date || item.first_air_date || ""
  const time = Date.parse(date)
  return Number.isFinite(time) ? time : 0
}

function byReleaseDateDesc(a: TMDbMovie, b: TMDbMovie): number {
  return releaseTime(b) - releaseTime(a)
}

function byApiScoreDesc(a: TMDbMovie, b: TMDbMovie): number {
  return (b.popularity || 0) - (a.popularity || 0)
    || (b.vote_average || 0) - (a.vote_average || 0)
    || releaseTime(b) - releaseTime(a)
}

function featuredScore(item: TMDbMovie, sourceBoost = 0): number {
  const daysSinceRelease = Math.max(
    0,
    (Date.now() - releaseTime(item)) / 86_400_000
  )
  const recencyScore = releaseTime(item) > 0 ? Math.max(0, 1 - daysSinceRelease / 365) : 0
  const popularityScore = Math.log10((item.popularity || 0) + 1)
  const ratingScore = (item.vote_average || 0) / 10

  return sourceBoost + popularityScore * 0.45 + ratingScore * 0.3 + recencyScore * 0.25
}

function buildFeaturedRaw(sources: {
  trending: TMDbMovie[]
  popular: TMDbMovie[]
  topRated: TMDbMovie[]
  recent: TMDbMovie[]
}): TMDbMovie[] {
  const scores = new Map<number, number>()
  const items = new Map<number, TMDbMovie>()

  const add = (list: TMDbMovie[], boost: number) => {
    for (const item of list) {
      items.set(item.id, item)
      scores.set(item.id, Math.max(scores.get(item.id) || 0, featuredScore(item, boost)))
    }
  }

  add(sources.trending, 0.45)
  add(sources.popular, 0.3)
  add(sources.topRated, 0.2)
  add(sources.recent, 0.25)

  return [...items.values()].sort((a, b) =>
    (scores.get(b.id) || 0) - (scores.get(a.id) || 0)
      || byApiScoreDesc(a, b)
  )
}

function pickLanguages(detail: TMDbMovieDetail | null, lang: Lang): string[] {
  const spokenLanguages = Array.isArray(detail?.spoken_languages) ? detail.spoken_languages : []
  if (spokenLanguages.length > 0) {
    return spokenLanguages
      .slice(0, 2)
      .map((language) => displayLanguage(language.iso_639_1 || language.english_name, lang))
  }
  return [displayLanguage("es", lang), displayLanguage("en", lang)]
}

function fallbackDescription(overview: string, fallback: string): string {
  if (overview && overview.length > 10) return overview
  return fallback
}

function toMovie(
  item: TMDbMovie,
  detail: TMDbMovieDetail | null,
  genreNames: string,
  type: Movie["type"],
  index: number,
  trailerUrl: string | undefined,
  titleFallback: string,
  descriptionFallback: string,
  generalLabel: string,
  lang: Lang
): Movie {
  const title = item.title || item.name || titleFallback
  const date = item.release_date || item.first_air_date || ""
  const year = date ? new Date(date).getFullYear() : 2024
  const desc = fallbackDescription(item.overview || "", descriptionFallback)
  const longDesc = detail?.overview
    ? detail.overview
    : item.overview || desc
  const runtimeMinutes = detailRuntime(detail)
  const genreLabel = translateGenre(genreNames || generalLabel, lang)

  return {
    id: `${type}-${item.id}-${index}`,
    tmdbId: item.id,
    title,
    year: isNaN(year) ? 2024 : year,
    duration: runtimeStr(runtimeMinutes),
    durationSeconds: runtimeMinutes ? runtimeMinutes * 60 : undefined,
    quality: pickQuality(),
    rating: Math.round((item.vote_average || 0) * 10) / 10,
    contentRating: pickContentRating(),
    genre: genreLabel,
    language: pickLanguages(detail, lang),
    subtitles: [displayLanguage("es", lang), displayLanguage("en", lang)],
    description: desc,
    longDescription: longDesc,
    type,
    ...((type === "series" || type === "anime") && detail
      ? {
          seasons: detail.number_of_seasons ?? 1,
          episodes: detail.number_of_episodes ?? 10,
        }
      : {}),
    posterPath: item.poster_path || null,
    backdropPath: item.backdrop_path || item.poster_path || null,
    trailerUrl,
  }
}

// deduplicate by tmdbId
function dedupe(items: Movie[]): Movie[] {
  const seen = new Set<number>()
  return items.filter((m) => {
    if (seen.has(m.tmdbId)) return false
    seen.add(m.tmdbId)
    return true
  })
}

function dedupeRaw(items: TMDbMovie[]): TMDbMovie[] {
  const seen = new Set<number>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

// fetch multiple pages from a paginated fetcher — stops at maxPages or when TMDB says no more
async function fetchPages(
  fetcher: (page: number) => Promise<{ items: TMDbMovie[]; totalPages: number }>,
  maxPages: number
): Promise<TMDbMovie[]> {
  const all: TMDbMovie[] = []
  const seen = new Set<number>()
  for (let page = 1; page <= maxPages; page++) {
    let result: { items: TMDbMovie[]; totalPages: number }
    try {
      result = await fetcher(page)
    } catch {
      break // on error (including persistent 429), stop gracefully
    }
    const { items, totalPages } = result
    if (!items || items.length === 0) break
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        all.push(item)
      }
    }
    if (items.length < 20 || page >= totalPages) break
  }
  return all
}

// Run an array of async tasks with max concurrency
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      results[index] = await tasks[index]()
    }
  })
  await Promise.all(workers)
  return results
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function heroStorageId(item: TMDbMovie): string {
  return `${item.media_type || "movie"}-${item.id}`
}

function pickHeroItem(items: TMDbMovie[]): TMDbMovie | null {
  if (items.length === 0) return null
  const topApiResults = items.slice(0, Math.min(items.length, 24))
  return topApiResults[Math.floor(Math.random() * topApiResults.length)]
}

export interface TMDbState {
  hero: Movie | null
  categories: Category[]
  allMovies: Movie[]
  movies: Movie[]
  series: Movie[]
  anime: Movie[]
  loading: boolean
  error: string | null
  search: (query: string) => Promise<Movie[]>
}

export function useTMDB(): TMDbState {
  const [hero, setHero] = useState<Movie | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [allMovies, setAllMovies] = useState<Movie[]>([])
  const [movies, setMovies] = useState<Movie[]>([])
  const [animeList, setAnimeList] = useState<Movie[]>([])
  const [series, setSeries] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef<Lang | null>(null)
  const fetchGeneration = useRef(0)
  const stableCategoriesPublished = useRef(false)

  const { lang, t: translate } = useI18n()

  const fetchAll = useCallback(async () => {
    if (fetched.current === lang) return
    fetched.current = lang
    const generation = ++fetchGeneration.current
    stableCategoriesPublished.current = false
    setLoading(true)
    setError(null)
    try {
      const genres = await fetchGenres(lang)
      const genreMap: Record<number, string> = {}
      for (const g of genres) genreMap[g.id] = g.name

      const resolveGenre = (ids: number[] = []) =>
        (Array.isArray(ids) ? ids : [])
          .map((id) => genreMap[id])
          .filter(Boolean)
          .join(", ") || "General"

      const detailCache = new Map<string, Promise<TMDbMovieDetail | null>>()
      const tmdbTypeFor = (type: Movie["type"]) =>
        type === "series" || type === "anime" ? "tv" : "movie"
      const getCachedDetail = (id: number, type: Movie["type"]) => {
        const tmdbType = tmdbTypeFor(type)
        const key = `${tmdbType}-${id}`
        if (!detailCache.has(key)) {
          detailCache.set(
            key,
            fetchDetail(id, tmdbType, lang).catch(() => null)
          )
        }
        return detailCache.get(key)!
      }
      const rebuildMovie = (
        movie: Movie,
        detail: TMDbMovieDetail | null,
        type: Movie["type"],
        index: number,
        trailerUrl?: string
      ) =>
        toMovie(
          {
            id: movie.tmdbId,
            title: movie.title,
            name: movie.title,
            poster_path: movie.posterPath,
            backdrop_path: movie.backdropPath,
            overview: movie.description,
            vote_average: movie.rating,
            release_date: String(movie.year),
            first_air_date: String(movie.year),
            genre_ids: [],
            original_language: "",
            popularity: 0,
            media_type: tmdbTypeFor(type),
          },
          detail,
          movie.genre,
          type,
          index,
          trailerUrl,
          translate("movie.unknown"),
          translate("movie.fallback"),
          translate("common.general"),
          lang
        )

      const enrichMovie = async (movie: Movie, type: Movie["type"], index: number) => {
        const detail = await getCachedDetail(movie.tmdbId, type)
        const rebuilt = detail ? rebuildMovie(movie, detail, type, index, movie.trailerUrl) : movie
        if (!detail || (type !== "series" && type !== "anime")) return rebuilt

        const detailSeasonCount = detail.number_of_seasons || rebuilt.seasons || 0
        const groupedSeasons = await fetchTvEpisodeGroupSeasons(
          movie.tmdbId,
          detail.number_of_episodes || rebuilt.episodes || 0,
          detailSeasonCount,
          lang,
          Object.fromEntries(
            (detail.seasons || [])
              .filter((season) => season.season_number > 0 && season.name)
              .map((season) => [season.season_number, season.name])
          )
        )
        if (groupedSeasons.length === 0) return rebuilt

        return {
          ...rebuilt,
          seasons: Math.max(rebuilt.seasons || 0, groupedSeasons.length),
          totalSeasons: Math.max(rebuilt.totalSeasons || 0, groupedSeasons.length),
          seasonList: groupedSeasons.map((season) => ({
            season: season.season,
            title: season.title,
            episodes: [],
          })),
        }
      }

      const publishInitialContent = async () => {
        const initialTasks = [
          () => fetchPages((p) => fetchPopular("movie", p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchNowPlaying(p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchTrending("movie", p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchTopRated("movie", p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchPopular("tv", p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchTvTrending(p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchTvTopRated(p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchAnime(p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchAnimeByGenre(p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchAnimeTopRated(p, lang), INITIAL_PAGES),
          () => fetchPages((p) => fetchTrendingAll(p, lang), INITIAL_PAGES),
        ]
        const [
          popularMoviesRaw,
          nowPlayingMoviesRaw,
          trendingMoviesRaw,
          topRatedMoviesRaw,
          popularTvRaw,
          trendingTvRaw,
          topRatedTvRaw,
          animeKeywordRaw,
          animeGenreRaw,
          animeTopRatedRaw,
          trendingAllRaw,
        ] = await runWithConcurrency(initialTasks, FETCH_CONCURRENCY)

        const animeIds = new Set<number>()
        const animeRaw: TMDbMovie[] = []
        for (const item of [...animeKeywordRaw, ...animeGenreRaw, ...animeTopRatedRaw]) {
          if (!animeIds.has(item.id)) {
            animeIds.add(item.id)
            animeRaw.push({ ...item, media_type: "tv" })
          }
        }

        const toBasicMovie = (items: TMDbMovie[], type: Movie["type"]): Movie[] =>
          items.map((item, i) =>
            toMovie(item, null, resolveGenre(item.genre_ids || []), type, i, undefined, translate("movie.unknown"), translate("movie.fallback"), translate("common.general"), lang)
          )

        const movieIds = new Set<number>()
        const seriesIds = new Set<number>()
        const movieRaw: TMDbMovie[] = []
        const seriesRaw: TMDbMovie[] = []
        const addMovies = (items: TMDbMovie[]) => {
          for (const item of items) {
            if (!movieIds.has(item.id)) {
              movieIds.add(item.id)
              movieRaw.push({ ...item, media_type: item.media_type || "movie" })
            }
          }
        }
        const addSeries = (items: TMDbMovie[]) => {
          for (const item of items) {
            if (!seriesIds.has(item.id)) {
              seriesIds.add(item.id)
              seriesRaw.push({ ...item, media_type: "tv" })
            }
          }
        }

        addMovies(popularMoviesRaw)
        addMovies(nowPlayingMoviesRaw)
        addMovies(trendingMoviesRaw)
        addMovies(topRatedMoviesRaw)
        addSeries(popularTvRaw)
        addSeries(trendingTvRaw)
        addSeries(topRatedTvRaw)

        const featuredMovieRaw = buildFeaturedRaw({
          trending: trendingMoviesRaw,
          popular: popularMoviesRaw,
          topRated: topRatedMoviesRaw,
          recent: nowPlayingMoviesRaw,
        })
        const recentMovieRaw = dedupeRaw(
          nowPlayingMoviesRaw.length > 0
            ? nowPlayingMoviesRaw
            : [...popularMoviesRaw, ...trendingMoviesRaw, ...topRatedMoviesRaw]
        ).sort(byReleaseDateDesc)

        const masterMovie = dedupe(toBasicMovie(movieRaw, "movie"))
        const masterSeries = dedupe(toBasicMovie(seriesRaw.filter((item) => !animeIds.has(item.id)), "series"))
        const masterAnime = dedupe(toBasicMovie(animeRaw, "anime"))
        const featuredMovies = dedupe(toBasicMovie(featuredMovieRaw, "movie"))
        const recentMovies = dedupe(toBasicMovie(recentMovieRaw, "movie"))

        const heroRaw = [
          ...trendingAllRaw,
          ...trendingMoviesRaw.map((item) => ({ ...item, media_type: item.media_type || "movie" })),
          ...popularMoviesRaw.map((item) => ({ ...item, media_type: item.media_type || "movie" })),
          ...popularTvRaw.map((item) => ({ ...item, media_type: item.media_type || "tv" })),
          ...animeRaw.map((item) => ({ ...item, media_type: item.media_type || "tv" })),
        ]
        const heroCandidates = heroRaw.filter(
          (item) =>
            item.backdrop_path &&
            (item.media_type === "movie" || item.media_type === "tv")
        )
        const heroItem = pickHeroItem(heroCandidates.length > 0 ? heroCandidates : heroRaw)
        const heroMovie = heroItem
          ? toMovie(
              heroItem,
              null,
              resolveGenre(heroItem.genre_ids || []),
              (heroItem.media_type === "tv" ? "series" : "movie") as Movie["type"],
              0,
              undefined,
              translate("movie.unknown"),
              translate("movie.fallback"),
              translate("common.general"),
              lang
            )
          : null

        if (generation !== fetchGeneration.current) return false
        setHero(heroMovie)
        setCategories([
          { title: translate("home.featuredMovies"), items: featuredMovies.slice(0, 20) },
          { title: translate("home.recent"), items: recentMovies.slice(0, 20) },
          { title: translate("common.anime"), items: masterAnime.slice(0, 20) },
          { title: translate("common.series"), items: masterSeries.slice(0, 20) },
        ])
        setMovies(masterMovie)
        setSeries(masterSeries)
        setAnimeList(masterAnime)
        setAllMovies(dedupe([...masterMovie, ...masterSeries, ...masterAnime]))
        return true
      }

      if (!(await publishInitialContent())) return

      // ---- Fetch all content with controlled concurrency to respect TMDB rate limits ----
      // Core endpoints (high quality, fetch all real pages)
      const CORE_PAGES = MAX_PAGES
      // Genre endpoints (first N pages = top 100×N by popularity — more than enough per genre)
      const GENRE_PAGES = PAGES_PER_ENDPOINT

      const MOVIE_GENRE_IDS = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37]
      const TV_GENRE_IDS   = [10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 37]

      // Build task list — each is a lazy (() => Promise) so we can run them with concurrency control
      type FetchTask = { key: string; run: () => Promise<TMDbMovie[]> }
      const tasks: FetchTask[] = [
        { key: "popularMovies",  run: () => fetchPages((p) => fetchPopular("movie", p, lang), CORE_PAGES) },
        { key: "nowPlayingMovies", run: () => fetchPages((p) => fetchNowPlaying(p, lang), CORE_PAGES) },
        { key: "trendingMovies", run: () => fetchPages((p) => fetchTrending("movie", p, lang), CORE_PAGES) },
        { key: "topRatedMovies", run: () => fetchPages((p) => fetchTopRated("movie", p, lang), CORE_PAGES) },
        { key: "popularTv",      run: () => fetchPages((p) => fetchPopular("tv", p, lang), CORE_PAGES) },
        { key: "trendingTv",     run: () => fetchPages((p) => fetchTvTrending(p, lang), CORE_PAGES) },
        { key: "topRatedTv",     run: () => fetchPages((p) => fetchTvTopRated(p, lang), CORE_PAGES) },
        { key: "animeKeyword",   run: () => fetchPages((p) => fetchAnime(p, lang), CORE_PAGES) },
        { key: "animeGenre",     run: () => fetchPages((p) => fetchAnimeByGenre(p, lang), CORE_PAGES) },
        { key: "animeTopRated",  run: () => fetchPages((p) => fetchAnimeTopRated(p, lang), CORE_PAGES) },
        { key: "trendingAll",    run: () => fetchPages((p) => fetchTrendingAll(p, lang), CORE_PAGES) },
        ...MOVIE_GENRE_IDS.map((id) => ({
          key: `movieGenre_${id}`,
          run: () => fetchPages((p) => discoverByGenre(id, "movie", p, lang), GENRE_PAGES),
        })),
        ...TV_GENRE_IDS.map((id) => ({
          key: `tvGenre_${id}`,
          run: () => fetchPages((p) => discoverByGenre(id, "tv", p, lang), GENRE_PAGES),
        })),
      ]

      // Run all tasks with controlled concurrency
      const results = await runWithConcurrency(
        tasks.map((t) => t.run),
        FETCH_CONCURRENCY
      )

      const resultMap: Record<string, TMDbMovie[]> = {}
      for (let i = 0; i < tasks.length; i++) {
        resultMap[tasks[i].key] = results[i]
      }

      const popularMoviesRaw  = resultMap["popularMovies"]
      const nowPlayingMoviesRaw = resultMap["nowPlayingMovies"]
      const trendingMoviesRaw = resultMap["trendingMovies"]
      const topRatedMoviesRaw = resultMap["topRatedMovies"]
      const popularTvRaw      = resultMap["popularTv"]
      const trendingTvRaw     = resultMap["trendingTv"]
      const topRatedTvRaw     = resultMap["topRatedTv"]
      const trendingAllRaw    = resultMap["trendingAll"]

      // Merge all anime sources into one deduplicated set
      const animeIds = new Set<number>()
      const animeRaw: TMDbMovie[] = []
      for (const key of ["animeKeyword", "animeGenre", "animeTopRated"]) {
        for (const item of resultMap[key]) {
          if (!animeIds.has(item.id)) {
            animeIds.add(item.id)
            animeRaw.push({ ...item, media_type: "tv" })
          }
        }
      }

      // ---- Build full movie/series/anime lists (without detail enrichment) ----
      const allIds = new Set<number>()
      const allRaw: TMDbMovie[] = []

      const addRaw = (items: TMDbMovie[]) => {
        for (const item of items) {
          if (!allIds.has(item.id)) {
            allIds.add(item.id)
            allRaw.push(item)
          }
        }
      }

      addRaw(popularMoviesRaw)
      addRaw(nowPlayingMoviesRaw)
      addRaw(trendingMoviesRaw)
      addRaw(topRatedMoviesRaw)
      addRaw(popularTvRaw)
      addRaw(trendingTvRaw)
      addRaw(topRatedTvRaw)
      addRaw(animeRaw)
      addRaw(trendingAllRaw)
      // Add all genre discover results
      for (const key of Object.keys(resultMap)) {
        if (key.startsWith("movieGenre_") || key.startsWith("tvGenre_")) {
          addRaw(resultMap[key])
        }
      }

      // Separate by type
      const movieRaw: TMDbMovie[] = []
      const seriesRaw: TMDbMovie[] = []
      const animeRawItems: TMDbMovie[] = []

      for (const item of allRaw) {
        const isAnime = animeIds.has(item.id)
        const isTv =
          item.media_type === "tv" ||
          popularTvRaw.some((t) => t.id === item.id) ||
          trendingTvRaw.some((t) => t.id === item.id) ||
          topRatedTvRaw.some((t) => t.id === item.id)

        if (isAnime) {
          animeRawItems.push(item)
        } else if (isTv) {
          seriesRaw.push(item)
        } else {
          movieRaw.push(item)
        }
      }

      // ---- Convert raw items to Movie type (without details) ----
      const toBasicMovie = (
        items: TMDbMovie[],
        type: Movie["type"]
      ): Movie[] =>
        items.map((item, i) =>
          toMovie(item, null, resolveGenre(item.genre_ids || []), type, i, undefined, translate("movie.unknown"), translate("movie.fallback"), translate("common.general"), lang)
        )

      const allMoviesRaw = toBasicMovie(movieRaw, "movie")
      const allSeriesRaw = toBasicMovie(seriesRaw, "series")
      const allAnimeRaw = toBasicMovie(animeRawItems, "anime")

      const masterMovie = dedupe(allMoviesRaw)
      const masterSeries = dedupe(allSeriesRaw)
      const masterAnime = dedupe(allAnimeRaw)

      // ---- Hero (random trending item with backdrop) ----
      const heroRaw = [
        ...trendingAllRaw,
        ...trendingMoviesRaw.map((item) => ({ ...item, media_type: item.media_type || "movie" })),
        ...popularMoviesRaw.map((item) => ({ ...item, media_type: item.media_type || "movie" })),
        ...popularTvRaw.map((item) => ({ ...item, media_type: item.media_type || "tv" })),
        ...animeRaw.map((item) => ({ ...item, media_type: item.media_type || "tv" })),
      ]
      const heroIds = new Set<string>()
      const heroRawUnique = heroRaw.filter((item) => {
        const id = heroStorageId(item)
        if (heroIds.has(id)) return false
        heroIds.add(id)
        return true
      })
      const heroPool = heroRawUnique.filter(
        (item) =>
          item.backdrop_path &&
          (item.media_type === "movie" || item.media_type === "tv")
      )
      const fallbackHeroPool = heroRawUnique.filter(
        (item) => item.media_type === "movie" || item.media_type === "tv"
      )
      const heroCandidates = heroPool.length > 0 ? heroPool : fallbackHeroPool
      const heroItem = pickHeroItem(heroCandidates)

      let heroMovie: Movie | null = null
      if (heroItem) {
        let heroDetail: TMDbMovieDetail | null = null
        let heroTrailer: string | undefined
        try {
          const mt = heroItem.media_type || "movie"
          const result = await fetchDetailWithVideos(heroItem.id, mt as "movie" | "tv", lang)
          heroDetail = result.detail
          heroTrailer = result.trailerUrl || undefined
        } catch {
          try {
            const mt = heroItem.media_type || "movie"
            heroDetail = await fetchDetail(heroItem.id, mt as "movie" | "tv", lang)
          } catch {
            // Keep the basic TMDB item when localized details are unavailable.
          }
        }
        heroMovie = toMovie(
          heroItem,
          heroDetail,
          resolveGenre(heroItem.genre_ids || []),
          (heroItem.media_type === "tv" ? "series" : "movie") as Movie["type"],
          0,
          heroTrailer,
          translate("movie.unknown"),
          translate("movie.fallback"),
          translate("common.general"),
          lang
        )
      }
      if (generation !== fetchGeneration.current) return
      setHero(heroMovie)

      // ---- Enrich only items that go into carousels ----
      const enrichBatch = async (
        items: Movie[],
        type: Movie["type"]
      ): Promise<Movie[]> => {
        const results: Movie[] = []
        for (const movie of items) {
          let detail: TMDbMovieDetail | null
          let trailerUrl: string | undefined
          try {
            const result = await fetchDetailWithVideos(movie.tmdbId, tmdbTypeFor(type), lang)
            detail = result.detail
            trailerUrl = result.trailerUrl || undefined
            detailCache.set(`${tmdbTypeFor(type)}-${movie.tmdbId}`, Promise.resolve(detail))
          } catch {
            detail = await getCachedDetail(movie.tmdbId, type)
          }
          if (detail || trailerUrl) {
            const rebuilt = rebuildMovie(movie, detail, type, 0, trailerUrl)
            results.push(type === "movie" ? rebuilt : await enrichMovie(rebuilt, type, 0))
          } else {
            results.push(movie)
          }
        }
        return results
      }

      const enrichListWithDetails = (items: Movie[], type: Movie["type"]) =>
        mapWithConcurrency(items, DETAIL_CONCURRENCY, (movie, index) =>
          type === "movie"
            ? getCachedDetail(movie.tmdbId, type).then((detail) => detail ? rebuildMovie(movie, detail, type, index, movie.trailerUrl) : movie)
            : enrichMovie(movie, type, index)
        )

      // Use full master lists for carousels — no artificial caps
      const featuredMovieRaw = buildFeaturedRaw({
        trending: trendingMoviesRaw,
        popular: popularMoviesRaw,
        topRated: topRatedMoviesRaw,
        recent: nowPlayingMoviesRaw,
      })
      const recentMovieRaw = dedupeRaw(
        nowPlayingMoviesRaw.length > 0
          ? nowPlayingMoviesRaw
          : [...popularMoviesRaw, ...trendingMoviesRaw, ...topRatedMoviesRaw]
      ).sort(byReleaseDateDesc)
      const destacadasPool = dedupe(
        featuredMovieRaw.map((item, index) =>
          toMovie(item, null, resolveGenre(item.genre_ids || []), "movie", index, undefined, translate("movie.unknown"), translate("movie.fallback"), translate("common.general"), lang)
        )
      ).slice(0, 20)
      const recientesPool = dedupe(
        recentMovieRaw.map((item, index) =>
          toMovie(item, null, resolveGenre(item.genre_ids || []), "movie", index, undefined, translate("movie.unknown"), translate("movie.fallback"), translate("common.general"), lang)
        )
      ).slice(0, 20)

      const [
        destacadas,
        recientes,
        animeCat,
        seriesCat,
      ] = await Promise.all([
        enrichBatch(destacadasPool, "movie"),
        enrichBatch(recientesPool, "movie"),
        enrichBatch(masterAnime.slice(0, 20), "anime"),
        enrichBatch(masterSeries.slice(0, 20), "series"),
      ])

      const cats: Category[] = [
        { title: translate("home.featuredMovies"), items: destacadas },
        { title: translate("home.recent"), items: recientes },
        { title: translate("common.anime"), items: animeCat },
        { title: translate("common.series"), items: seriesCat },
      ]

      const [enrichedMovies, enrichedSeries, enrichedAnime] = await Promise.all([
        enrichListWithDetails(masterMovie, "movie"),
        enrichListWithDetails(masterSeries, "series"),
        enrichListWithDetails(masterAnime, "anime"),
      ])
      const enrichedAll = dedupe([
        ...enrichedMovies,
        ...enrichedSeries,
        ...enrichedAnime,
      ])

      if (generation !== fetchGeneration.current) return
      setCategories(cats)
      stableCategoriesPublished.current = true
      setAllMovies(enrichedAll)
      setMovies(enrichedMovies)
      setSeries(enrichedSeries)
      setAnimeList(enrichedAnime)
    } catch (err) {
      if (generation !== fetchGeneration.current) return
      setError(
        err instanceof Error ? err.message : translate("tmdb.loadError")
      )
    } finally {
      if (generation === fetchGeneration.current) setLoading(false)
    }
  }, [lang, translate])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ---- Search with pagination ----
  const search = useCallback(
    async (query: string): Promise<Movie[]> => {
      if (!query.trim()) return []
      try {
        const allSearchResults: TMDbMovie[] = []
        const seenSearchIds = new Set<number>()
        for (let page = 1; page <= 5; page++) {
          const items = await searchMulti(query, page, lang)
          if (!items || items.length === 0) break
          for (const item of items) {
            if (!seenSearchIds.has(item.id)) {
              seenSearchIds.add(item.id)
              allSearchResults.push(item)
            }
          }
          if (items.length < 20) break
        }
        const enriched: Movie[] = []
        for (let i = 0; i < Math.min(allSearchResults.length, 60); i++) {
          const item = allSearchResults[i]
          const mediaType = item.media_type || "movie"
          const t: Movie["type"] =
            mediaType === "tv"
              ? "series"
              : mediaType === "movie"
                ? "movie"
                : "movie"
          const g = await mapGenres(item.genre_ids || [], lang)
          let detail: TMDbMovieDetail | null = null
          let trailerUrl: string | undefined
          try {
            const result = await fetchDetailWithVideos(
              item.id,
              t === "series" ? "tv" : "movie",
              lang
            )
            detail = result.detail
            trailerUrl = result.trailerUrl || undefined
          } catch {
            try {
              detail = await fetchDetail(
                item.id,
                t === "series" ? "tv" : "movie",
                lang
              )
            } catch {
            // Keep the basic TMDB item when localized details are unavailable.
          }
          }
          const movie = toMovie(item, detail, g, t, i, trailerUrl, translate("movie.unknown"), translate("movie.fallback"), translate("common.general"), lang)
          if (detail && t === "series") {
            const groupedSeasons = await fetchTvEpisodeGroupSeasons(
              item.id,
              detail.number_of_episodes || movie.episodes || 0,
              detail.number_of_seasons || movie.seasons || 0,
              lang,
              Object.fromEntries(
                (detail.seasons || [])
                  .filter((season) => season.season_number > 0 && season.name)
                  .map((season) => [season.season_number, season.name])
              )
            )
            if (groupedSeasons.length > 0) {
              enriched.push({
                ...movie,
                seasons: Math.max(movie.seasons || 0, groupedSeasons.length),
                totalSeasons: Math.max(movie.totalSeasons || 0, groupedSeasons.length),
                seasonList: groupedSeasons.map((season) => ({
                  season: season.season,
                  title: season.title,
                  episodes: [],
                })),
              })
              continue
            }
          }
          enriched.push(movie)
        }
        return enriched
      } catch {
        return []
      }
    },
    [lang, translate]
  )

  return {
    hero,
    categories,
    allMovies,
    movies,
    series,
    anime: animeList,
    loading,
    error,
    search,
  }
}
