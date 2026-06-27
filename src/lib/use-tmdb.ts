/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback, useRef } from "react"
import type { Movie, Category } from "@/lib/data"
import {
  fetchTrending,
  fetchPopular,
  fetchTopRated,
  discoverByGenre,
  fetchAnime,
  fetchTrendingAll,
  fetchDetail,
  fetchDetailWithVideos,
  mapGenres,
  fetchGenres,
  searchMulti,
  type TMDbMovie,
  type TMDbMovieDetail,
} from "@/lib/tmdb"
import { useConfig } from "@/lib/use-config"
import { useI18n } from "@/i18n/I18nProvider"
import { displayLanguage, type Lang } from "@/i18n/translations"

const QUALITIES = ["4K", "1080p", "4K HDR", "1080p HDR", "720p"]
const MAX_PAGES = 10 // fetch up to 10 pages per endpoint
const DETAIL_CONCURRENCY = 8
const HERO_STORAGE_KEY = "flick-tmdb-last-hero"
const HERO_INDEX_STORAGE_KEY = "flick-tmdb-hero-index"

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
    genre: genreNames || generalLabel,
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

// fetch multiple pages from a paginated fetcher
async function fetchPages(
  fetcher: (page: number) => Promise<TMDbMovie[]>,
  maxPages: number
): Promise<TMDbMovie[]> {
  const all: TMDbMovie[] = []
  const seen = new Set<number>()
  for (let page = 1; page <= maxPages; page++) {
    const items = await fetcher(page)
    if (!items || items.length === 0) break
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        all.push(item)
      }
    }
    // if page had fewer than 20 items, we've reached the end
    if (items.length < 20) break
  }
  return all
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

  let lastHeroId: string | null = null
  let lastHeroIndex = -1
  if (typeof window !== "undefined") {
    try {
      lastHeroId = window.localStorage.getItem(HERO_STORAGE_KEY)
      lastHeroIndex = Number(window.localStorage.getItem(HERO_INDEX_STORAGE_KEY) ?? "-1")
    } catch {
      lastHeroId = null
      lastHeroIndex = -1
    }
  }

  const sorted = [...items].sort((a, b) => heroStorageId(a).localeCompare(heroStorageId(b)))
  const currentIndex = Number.isFinite(lastHeroIndex)
    ? lastHeroIndex
    : sorted.findIndex((item) => heroStorageId(item) === lastHeroId)
  let nextIndex = (currentIndex + 1) % sorted.length
  if (sorted.length > 1 && lastHeroId && heroStorageId(sorted[nextIndex]) === lastHeroId) {
    nextIndex = (nextIndex + 1) % sorted.length
  }
  const selected = sorted[nextIndex]

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HERO_STORAGE_KEY, heroStorageId(selected))
      window.localStorage.setItem(HERO_INDEX_STORAGE_KEY, String(nextIndex))
    } catch {
      // Storage can be unavailable in private or restricted contexts.
    }
  }

  return selected
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

  const { dataSource } = useConfig()
  const { lang, t: translate } = useI18n()

  const fetchAll = useCallback(async () => {
    if (dataSource !== "tmdb") {
      setLoading(false)
      return
    }
    if (fetched.current === lang) return
    fetched.current = lang
    const generation = ++fetchGeneration.current
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
          .slice(0, 2)
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

      // ---- Fetch ALL pages in parallel ----
      const [
        popularMoviesRaw,
        trendingMoviesRaw,
        topRatedMoviesRaw,
        popularTvRaw,
        animeRaw,
        actionRaw,
        horrorRaw,
        comedyRaw,
        trendingAllRaw,
      ] = await Promise.all([
        fetchPages((p) => fetchPopular("movie", p, lang), MAX_PAGES),
        fetchPages((p) => fetchTrending("movie", p, lang), MAX_PAGES),
        fetchPages((p) => fetchTopRated("movie", p, lang), MAX_PAGES),
        fetchPages((p) => fetchPopular("tv", p, lang), MAX_PAGES),
        fetchPages((p) => fetchAnime(p, lang), MAX_PAGES),
        fetchPages((p) => discoverByGenre(28, "movie", p, lang), 5),
        fetchPages((p) => discoverByGenre(27, "movie", p, lang), 5),
        fetchPages((p) => discoverByGenre(35, "movie", p, lang), 5),
        fetchPages((p) => fetchTrendingAll(p, lang), 5),
      ])

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
      addRaw(trendingMoviesRaw)
      addRaw(topRatedMoviesRaw)
      addRaw(popularTvRaw)
      addRaw(animeRaw)
      addRaw(actionRaw)
      addRaw(horrorRaw)
      addRaw(comedyRaw)
      addRaw(trendingAllRaw)

      // Separate by type
      const movieRaw: TMDbMovie[] = []
      const seriesRaw: TMDbMovie[] = []
      const animeRawItems: TMDbMovie[] = []

      for (const item of allRaw) {
        // check if it's in the anime dedicated list
        const isAnime = animeRaw.some((a) => a.id === item.id)
        const isTv =
          item.media_type === "tv" ||
          popularTvRaw.some((t) => t.id === item.id)

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
            results.push(rebuildMovie(movie, detail, type, 0, trailerUrl))
          } else {
            results.push(movie)
          }
        }
        return results
      }

      const enrichListWithDetails = (items: Movie[], type: Movie["type"]) =>
        mapWithConcurrency(items, DETAIL_CONCURRENCY, async (movie, index) => {
          const detail = await getCachedDetail(movie.tmdbId, type)
          return detail ? rebuildMovie(movie, detail, type, index, movie.trailerUrl) : movie
        })

      // Carousel items: take first N from each master list
      const carouselMovie = masterMovie.slice(0, 60)
      const carouselSeries = masterSeries.slice(0, 30)
      const carouselAnime = masterAnime.slice(0, 30)

      // Build genre-specific pools first
      const actionPool = carouselMovie.filter((m) => actionRaw.some((item) => item.id === m.tmdbId))
      const horrorPool = carouselMovie.filter((m) => horrorRaw.some((item) => item.id === m.tmdbId))
      const comedyPool = carouselMovie.filter((m) => comedyRaw.some((item) => item.id === m.tmdbId))

      // General pool: movies not claimed by any genre pool
      const genrePoolIds = new Set([
        ...actionPool.map((m) => m.tmdbId),
        ...horrorPool.map((m) => m.tmdbId),
        ...comedyPool.map((m) => m.tmdbId),
      ])
      const generalPool = carouselMovie.filter((m) => !genrePoolIds.has(m.tmdbId))

      // Each section gets a non-overlapping slice from the general pool
      const contViendoPool = generalPool.slice(0, 12)
      const destacadasPool = generalPool.slice(12, 28)
      const recientesPool = [...carouselMovie].sort((a, b) => b.year - a.year).slice(0, 12)

      const [
        contViendo,
        destacadas,
        recientes,
        animeCat,
        seriesCat,
        actionCat,
        horrorCat,
        comedyCat,
      ] = await Promise.all([
        enrichBatch(contViendoPool, "movie"),
        enrichBatch(destacadasPool, "movie"),
        enrichBatch(recientesPool, "movie"),
        enrichBatch(carouselAnime.slice(0, 12), "anime"),
        enrichBatch(carouselSeries.slice(0, 12), "series"),
        enrichBatch(actionPool.slice(0, 10), "movie"),
        enrichBatch(horrorPool.slice(0, 8), "movie"),
        enrichBatch(comedyPool.slice(0, 8), "movie"),
      ])

      const cats: Category[] = [
        { title: translate("home.continue"), items: contViendo },
        { title: translate("home.featuredMovies"), items: destacadas },
        { title: translate("home.recent"), items: recientes },
        { title: translate("common.anime"), items: animeCat },
        { title: translate("common.series"), items: seriesCat },
        { title: translate("home.action"), items: actionCat },
        { title: translate("home.horror"), items: horrorCat },
        { title: translate("home.comedy"), items: comedyCat },
        { title: translate("nav.favorites"), items: [] },
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
  }, [dataSource, lang, translate])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ---- Search with pagination ----
  const search = useCallback(
    async (query: string): Promise<Movie[]> => {
      if (!query.trim()) return []
      try {
        const allSearchResults = await fetchPages(
          (p) => searchMulti(query, p, lang),
          5
        )
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
          enriched.push(toMovie(item, detail, g, t, i, trailerUrl, translate("movie.unknown"), translate("movie.fallback"), translate("common.general"), lang))
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
