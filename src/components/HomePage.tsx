"use client"

import { useState, useMemo, useCallback, useEffect, Suspense, Fragment } from "react"
import Header from "@/components/Header"
import HeroSection from "@/components/HeroSection"
import MovieCarousel from "@/components/MovieCarousel"
import FlickTextLoader from "@/components/FlickTextLoader"
import { Spinner } from "@/components/ui/spinner"
import { useCatalog } from "@/lib/use-catalog"
import { getPlayableMovie, type Movie } from "@/lib/data"
import { listWatchProgress } from "@/lib/watch-progress"
import { actorPath, categoryPath, contentPath, creditContentPath, parseActorRoute, parseBrowseRoute, parseContentRoute, samePath, sectionPath, slugifyTitle, watchPath, type ParsedContentRoute } from "@/lib/routes"
import { useI18n } from "@/i18n/I18nProvider"
import { translateGenre } from "@/i18n/translations"
import { useScrollViewport } from "@/lib/scroll-container"
import { lazyWithReload } from "@/lib/lazy-with-reload"

const SearchPage = lazyWithReload(() => import("@/components/SearchPage"))
const LibraryPage = lazyWithReload(() => import("@/components/LibraryPage"))
const PlayerPage = lazyWithReload(() => import("@/components/PlayerPage"))
const CategoryPage = lazyWithReload(() => import("@/components/CategoryPage"))
const MovieDetailPage = lazyWithReload(() => import("@/components/MovieDetailPage"))
const MovieDetailsModal = lazyWithReload(() => import("@/components/MovieDetailsModal"))
const ActorPage = lazyWithReload(() => import("@/components/ActorPage"))

type PageView = "home" | "search" | "library" | "player" | "category" | "detail" | "actor"

const HERO_ROTATION_MS = 15_000
const HERO_EXIT_MS = 720
const HERO_MIN_RATING = 6.5


// Resolves a watch-progress entry's id back to the actual playable Movie —
// either a standalone catalog item, or one specific episode nested inside a
// series/anime's seriesEpisodes.
function findPlayableById(allMovies: Movie[], id: string): Movie | null {
  for (const item of allMovies) {
    if (item.id === id) return item
    const episode = item.seriesEpisodes?.find((ep) => ep.id === id)
    if (episode) return episode
  }
  return null
}

interface ViewAllCtx {
  t: (key: string) => string
  movies: Movie[]
  series: Movie[]
  anime: Movie[]
  categoryTitles: Record<string, string>
  setCategoryType: (t: "movie" | "series" | "anime") => void
  setCategoryGenre: (g: string | null) => void
  setCurrentPage: (p: string) => void
  setPath: (path: string) => void
  setView: (v: PageView) => void
}

function buildViewAll(
  category: { title: string; items: Movie[] },
  ctx: ViewAllCtx
): (() => void) | undefined {
  const { t, movies, series, anime, setCategoryType, setCategoryGenre, setCurrentPage, setPath, setView } = ctx

  if (category.items.length === 0) return undefined

  const title = category.title

  if (title === t("common.anime")) {
    if (anime.length === 0) return undefined
    return () => {
      setCategoryType("anime")
      setCategoryGenre(null)
      setCurrentPage("anime")
      setPath(sectionPath("anime"))
      setView("category")
    }
  }

  if (title === t("common.series")) {
    if (series.length === 0) return undefined
    return () => {
      setCategoryType("series")
      setCategoryGenre(null)
      setCurrentPage("series")
      setPath(sectionPath("series"))
      setView("category")
    }
  }

  const hasAnime = category.items.some((m) => m.type === "anime")
  const hasSeries = category.items.some((m) => m.type === "series")
  const hasMovies = category.items.some((m) => m.type === "movie")
  const dominantType: "movie" | "series" | "anime" = hasAnime ? "anime" : hasSeries ? "series" : "movie"

  const matchedGenre = category.items
    .flatMap((m) => m.genre.split(",").map((g) => g.trim()).filter(Boolean))
    .find((g) => g.toLowerCase() === title.toLowerCase())

  if (matchedGenre) {
    return () => {
      setCategoryType(dominantType)
      setCategoryGenre(matchedGenre)
      setCurrentPage(dominantType === "movie" ? "movies" : dominantType === "series" ? "series" : "anime")
      setPath(categoryPath(dominantType, matchedGenre))
      setView("category")
    }
  }

  const knownGenreKeys: { key: string; genre: string }[] = [
    { key: "home.action", genre: "Action" },
    { key: "home.horror", genre: "Horror" },
    { key: "home.comedy", genre: "Comedy" },
  ]

  for (const { key, genre } of knownGenreKeys) {
    if (title === t(key)) {
      const genreInData = category.items
        .flatMap((m) => m.genre.split(",").map((g) => g.trim()))
        .find((g) => g.toLowerCase().includes(genre.toLowerCase()))
      if (!genreInData) return undefined
      return () => {
        setCategoryType("movie")
        setCategoryGenre(genreInData)
        setCurrentPage("movies")
        setPath(categoryPath("movie", genreInData))
        setView("category")
      }
    }
  }

  if (hasMovies && movies.length > 0) {
    return () => {
      setCategoryType("movie")
      setCategoryGenre(null)
      setCurrentPage("movies")
      setPath(sectionPath("movie"))
      setView("category")
    }
  }

  return undefined
}

export default function HomePage() {
  const { lang, t } = useI18n()
  const tmdb = useCatalog()
  const { allMovies, loading, error, hero: tmdbHero, categories, trendingTmdbIds } = tmdb
  const scrollViewport = useScrollViewport()

  const [currentPage, setCurrentPage] = useState("home")
  const [view, setView] = useState<PageView>("home")
  const [categoryType, setCategoryType] = useState<"movie" | "series" | "anime">("movie")
  const [categoryGenre, setCategoryGenre] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Movie[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null)
  const [selectedActorId, setSelectedActorId] = useState<number | null>(null)
  const [pendingContentRoute, setPendingContentRoute] = useState<ParsedContentRoute | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedQualities, setSelectedQualities] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [sortBy, setSortBy] = useState("recent")
  const [heroMovieId, setHeroMovieId] = useState<string | null>(null)
  const [visibleHero, setVisibleHero] = useState<Movie | null>(null)
  const [exitingHero, setExitingHero] = useState<Movie | null>(null)
  const [watchProgressEntries, setWatchProgressEntries] = useState<ReturnType<typeof listWatchProgress>>([])

  // Re-read progress every time the user lands back on the home view (e.g.
  // after watching something) so "Continue Watching" reflects the latest
  // position without needing a full page reload.
  useEffect(() => {
    if (view === "home") setWatchProgressEntries(listWatchProgress())
  }, [view])

  const continueWatchingItems = useMemo(() => {
    return watchProgressEntries
      .map((entry) => {
        const movie = findPlayableById(allMovies, entry.id)
        if (!movie) return null
        return { movie, progressRatio: entry.duration > 0 ? entry.currentTime / entry.duration : 0 }
      })
      .filter((item): item is { movie: Movie; progressRatio: number } => item !== null)
  }, [watchProgressEntries, allMovies])

  const continueWatchingProgressById = useMemo(
    () => new Map(continueWatchingItems.map(({ movie, progressRatio }) => [movie.id, progressRatio])),
    [continueWatchingItems]
  )

  const setPath = useCallback((path: string, replace = false) => {
    if (typeof window === "undefined" || samePath(path)) return
    const method = replace ? "replaceState" : "pushState"
    window.history[method](null, "", path)
  }, [])

  const goHome = useCallback((replace = false) => {
    setView("home")
    setCurrentPage("home")
    setSelectedMovie(null)
    setPath("/", replace)
    scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath, scrollViewport])

  const hasHeroSynopsis = useCallback((item: Movie | null | undefined) => {
    const description = (item?.description || item?.longDescription || "").trim()
    if (description.length < 24) return false
    return description !== t("movie.fallback")
  }, [t])

  // ---- Genre affinity tracking (localStorage) ----
  const AFFINITY_KEY = "flick-genre-affinity"
  const getAffinity = useCallback((): Record<string, number> => {
    try {
      const raw = localStorage.getItem(AFFINITY_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }, [])

  const trackGenreView = useCallback((genreStr: string) => {
    const genres = genreStr.split(",").map((g) => g.trim().toLowerCase()).filter(Boolean)
    if (genres.length === 0) return
    const affinity = getAffinity()
    for (const genre of genres) {
      affinity[genre] = (affinity[genre] || 0) + 1
    }
    try { localStorage.setItem(AFFINITY_KEY, JSON.stringify(affinity)) } catch { /* ignore */ }
  }, [getAffinity])

  const getUserAffinity = useCallback((movieGenre: string, affinity: Record<string, number>): number => {
    if (Object.keys(affinity).length === 0) return 0.5
    const genres = movieGenre.split(",").map((g) => g.trim().toLowerCase()).filter(Boolean)
    const maxCount = Math.max(...Object.values(affinity), 1)
    let score = 0
    for (const genre of genres) {
      score = Math.max(score, (affinity[genre] || 0) / maxCount)
    }
    return score || 0.5
  }, [])

  // ---- Hero scoring ----
  const HERO_POOL_SIZE = 10
  const currentYear = new Date().getFullYear()

  const scoredHeroCandidates = useMemo(() => {
    const affinity = getAffinity()
    const candidates = allMovies.filter(
      (item) =>
        item.rating >= HERO_MIN_RATING &&
        (item.backdropPath || item.posterPath) &&
        hasHeroSynopsis(item)
    )
    if (candidates.length === 0) return []

    const maxPopularity = Math.max(...candidates.map((m) => m.popularity || 0), 1)
    const years = candidates.map((m) => m.year).filter((y) => y > 0)
    const minYear = Math.min(...years)
    const maxYear = Math.max(...years)
    const yearRange = Math.max(maxYear - minYear, 1)

    const scored = candidates.map((item) => {
      const popularityScore = Math.min((item.popularity || 0) / maxPopularity, 1)
      const trendingScore = trendingTmdbIds.has(item.tmdbId) ? 1 : 0
      const recencyScore = item.year > 0 ? Math.min((item.year - minYear) / yearRange, 1) : 0
      const affinityScore = getUserAffinity(item.genre, affinity)

      const total =
        popularityScore * 0.35 +
        trendingScore * 0.25 +
        recencyScore * 0.15 +
        affinityScore * 0.25

      return { item, score: total }
    })

    return scored.sort((a, b) => b.score - a.score).slice(0, HERO_POOL_SIZE)
  }, [allMovies, trendingTmdbIds, hasHeroSynopsis, getAffinity, getUserAffinity])

  const chooseNextHero = useCallback((currentId: string | null) => {
    const alternatives = scoredHeroCandidates.filter(({ item }) => item.id !== currentId)
    const pool = alternatives.length > 0 ? alternatives : scoredHeroCandidates
    return pool[0]?.item.id || null
  }, [scoredHeroCandidates])

  useEffect(() => {
    if (scoredHeroCandidates.length === 0) {
      setHeroMovieId(null)
      return
    }
    setHeroMovieId((currentId) => {
      if (currentId && scoredHeroCandidates.some(({ item }) => item.id === currentId)) {
        return currentId
      }
      const tmdbHeroCandidate = tmdbHero
        ? scoredHeroCandidates.find(({ item }) => item.tmdbId === tmdbHero.tmdbId)
        : undefined
      return tmdbHeroCandidate?.item.id || chooseNextHero(currentId)
    })
  }, [scoredHeroCandidates, tmdbHero?.tmdbId, chooseNextHero])

  useEffect(() => {
    if (view !== "home" || scoredHeroCandidates.length < 2) return
    const rotationTimer = window.setInterval(() => {
      setHeroMovieId((currentId) => chooseNextHero(currentId))
    }, HERO_ROTATION_MS)
    return () => window.clearInterval(rotationTimer)
  }, [scoredHeroCandidates, view, chooseNextHero])

  const hero = useMemo(() => {
    const found = scoredHeroCandidates.find(({ item }) => item.id === heroMovieId)
    const selected = found?.item || null
    if (selected && tmdbHero?.tmdbId === selected.tmdbId && tmdbHero.duration !== "-") {
      return { ...selected, duration: tmdbHero.duration, durationSeconds: tmdbHero.durationSeconds, trailerUrl: selected.trailerUrl || tmdbHero.trailerUrl }
    }
    return selected
  }, [heroMovieId, tmdbHero, scoredHeroCandidates, hasHeroSynopsis])

  useEffect(() => {
    if (!hero) {
      setVisibleHero(null)
      setExitingHero(null)
      return
    }
    setVisibleHero((current) => {
      if (!current) return hero
      if (current.id === hero.id) return hero
      setExitingHero(current)
      window.setTimeout(() => {
        setExitingHero((previous) => previous?.id === current.id ? null : previous)
      }, HERO_EXIT_MS)
      return hero
    })
  }, [hero])

  useEffect(() => {
    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) {
      setSearchResults([])
      setSearchLoading(false)
      setView("home")
      return
    }

    if (view !== "search") setView("search")
    setSearchLoading(true)

    let cancelled = false
    // Debounce so we don't fire a request on every keystroke, and guard
    // against out-of-order responses so a slow, stale request can't
    // overwrite the results of a newer one.
    const debounceId = window.setTimeout(() => {
      tmdb.search(trimmedQuery).then((results) => {
        if (cancelled) return
        setSearchResults(results)
        setSearchLoading(false)
      })
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(debounceId)
    }
  }, [searchQuery, tmdb.search])

  const genreFromSlug = useCallback((items: Movie[], genreSlug: string | null) => {
    if (!genreSlug) return null
    return items
      .flatMap((item) => item.genre.split(",").map((genre) => genre.trim()).filter(Boolean))
      .find((genre) => slugifyTitle(genre) === genreSlug) || null
  }, [])

  useEffect(() => {
    const applyRoute = () => {
      const actorRoute = parseActorRoute(window.location.pathname)
      if (actorRoute) {
        setSelectedActorId(actorRoute.id)
        setView("actor")
        scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
        return
      }

      const contentRoute = parseContentRoute(window.location.pathname)
      if (contentRoute) {
        const baseItem = allMovies.find((movie) => movie.tmdbId === contentRoute.tmdbId && movie.type === contentRoute.type)
        const item = contentRoute.season && contentRoute.episode
          ? baseItem?.seriesEpisodes?.find((episode) =>
              episode.seasonNumber === contentRoute.season && episode.episodeNumber === contentRoute.episode
            ) || baseItem
          : baseItem
        if (item) {
          setSelectedMovie(item)
          setView(contentRoute.view === "watch" ? "player" : "detail")
          setCurrentPage(contentRoute.type === "movie" ? "movies" : contentRoute.type)
          setPendingContentRoute(null)
          scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
          return
        }
        // Not in catalog — fetch on-demand instead of falling through to browse route
        setPendingContentRoute(contentRoute)
        return
      }

      const browseRoute = parseBrowseRoute(window.location.pathname)
      if (browseRoute) {
        const routeItems = browseRoute.type === "movie" ? tmdb.movies : browseRoute.type === "series" ? tmdb.series : tmdb.anime
        setSelectedMovie(null)
        setCategoryType(browseRoute.type)
        setCategoryGenre(genreFromSlug(routeItems, browseRoute.genreSlug))
        setCurrentPage(browseRoute.type === "movie" ? "movies" : browseRoute.type)
        setView("category")
        scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
        return
      }

      if (!contentRoute) {
        if (window.location.pathname === "/") {
          setView("home")
          setCurrentPage("home")
        }
        return
      }
    }

    applyRoute()
    window.addEventListener("popstate", applyRoute)
    return () => window.removeEventListener("popstate", applyRoute)
  }, [allMovies, genreFromSlug, tmdb.anime, tmdb.movies, tmdb.series, scrollViewport])

  // Fetch content on demand when navigating directly to a URL not in the catalog
  useEffect(() => {
    if (!pendingContentRoute) return
    let cancelled = false
    const fetchContent = async () => {
      const movie = await tmdb.loadDetail(pendingContentRoute.tmdbId, pendingContentRoute.type)
      if (cancelled || !movie) return
      setSelectedMovie(movie)
      setView(pendingContentRoute.view === "watch" ? "player" : "detail")
      setCurrentPage(pendingContentRoute.type === "movie" ? "movies" : pendingContentRoute.type)
      setPendingContentRoute(null)
      scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
    }
    fetchContent()
    return () => { cancelled = true }
  }, [pendingContentRoute, tmdb.loadDetail, scrollViewport])

  const handleNavigate = useCallback((page: string) => {
    if (page === "home") {
      goHome()
    } else if (page === "library") {
      setView("library")
      setCurrentPage(page)
      setPath("/library")
    } else if (page === "movies") {
      trackGenreView("movie")
      setCategoryType("movie")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("movies")
      setPath(sectionPath("movie"))
    } else if (page === "series") {
      trackGenreView("series")
      setCategoryType("series")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("series")
      setPath(sectionPath("series"))
    } else if (page === "anime") {
      trackGenreView("anime")
      setCategoryType("anime")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("anime")
      setPath(sectionPath("anime"))
    } else {
      setCurrentPage(page)
    }
  }, [goHome, setPath, trackGenreView])

  const handlePlay = useCallback((movie: Movie) => {
    const playable = getPlayableMovie(movie)
    if (!playable) return
    trackGenreView(movie.genre)
    setSelectedMovie(playable)
    setView("player")
    setPath(watchPath(playable))
    scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath, trackGenreView, scrollViewport])

  const handleDetails = useCallback((movie: Movie) => {
    trackGenreView(movie.genre)
    setSelectedMovie(movie)
    setView("detail")
    setPath(contentPath(movie))
    scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath, trackGenreView, scrollViewport])

  const handleMovieClick = useCallback((movie: Movie) => {
    trackGenreView(movie.genre)
    setSelectedMovie(movie)
    setView("detail")
    setPath(contentPath(movie))
    scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath, trackGenreView, scrollViewport])

  const handleActorClick = useCallback((id: number, name: string) => {
    setSelectedActorId(id)
    setView("actor")
    setPath(actorPath(id, name))
    scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath, scrollViewport])

  // A filmography credit isn't a full local Movie object — find it in the loaded
  // catalog if it's there, otherwise reuse the same on-demand TMDB fetch the URL
  // router falls back to for a direct link to something outside the catalog.
  const handleCreditClick = useCallback((mediaType: "movie" | "tv", id: number, title: string) => {
    const path = creditContentPath(mediaType, id, title)
    const route = parseContentRoute(path)
    if (!route) return
    setPath(path)
    const item = allMovies.find((movie) => movie.tmdbId === route.tmdbId && movie.type === route.type)
    if (item) {
      setSelectedMovie(item)
      setView("detail")
    } else {
      setPendingContentRoute(route)
    }
    scrollViewport?.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath, scrollViewport, allMovies])


  const handleFilterReset = useCallback(() => {
    setSelectedGenres([])
    setSelectedQualities([])
    setSelectedTypes([])
    setSortBy("recent")
  }, [])

  const handleGenreToggle = useCallback((genre: string) => {
    setSelectedGenres((previous) => previous.includes(genre) ? previous.filter((item) => item !== genre) : [...previous, genre])
  }, [])

  const handleQualityToggle = useCallback((quality: string) => {
    setSelectedQualities((previous) => previous.includes(quality) ? previous.filter((item) => item !== quality) : [...previous, quality])
  }, [])

  const handleTypeToggle = useCallback((type: string) => {
    setSelectedTypes((previous) => previous.includes(type) ? previous.filter((item) => item !== type) : [...previous, type])
  }, [])

  const movies = tmdb.movies
  const series = tmdb.series
  const anime = tmdb.anime
  const moviesByType = useMemo(() => ({ movies, series, anime }), [movies, series, anime])
  const movieGenreCategories = useMemo(() => {
    const desiredGenres = ["Horror", "Action", "Family", "Comedy", "Adventure", "Science Fiction"]
    return desiredGenres
      .map((genre) => {
        const title = translateGenre(genre, lang)
        const items = movies.filter((movie) =>
          movie.genre
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .includes(title.toLowerCase())
        )
        return { title, items: items.slice(0, 20) }
      })
      .filter((category) => category.items.length > 0)
  }, [lang, movies])
  const homeCategories = useMemo(
    () => [...categories, ...movieGenreCategories],
    [categories, movieGenreCategories]
  )

  const selectedSeries = useMemo(() => {
    if (!selectedMovie) return undefined
    if (selectedMovie.seriesEpisodes) return selectedMovie
    if (!selectedMovie.seriesTitle) return undefined
    return allMovies.find((item) => item.title === selectedMovie.seriesTitle && item.seriesEpisodes)
  }, [selectedMovie, allMovies])

  const episodeList = useMemo(() => selectedSeries?.seriesEpisodes || [], [selectedSeries])

  const relatedMovies = useMemo(() => {
    if (!selectedMovie) return []
    const reference = selectedSeries || selectedMovie
    const referenceGenres = new Set(reference.genre.split(",").map((genre) => genre.trim()).filter(Boolean))

    if (reference.type === "movie") {
      return allMovies.filter((item) =>
        item.type === "movie" &&
        item.id !== reference.id &&
        item.genre.split(",").some((genre) => referenceGenres.has(genre.trim()))
      ).slice(0, 10)
    }

    return allMovies.filter((item) =>
      item.id !== reference.id &&
      item.type === reference.type &&
      item.genre.split(",").some((genre) => referenceGenres.has(genre.trim()))
    ).slice(0, 10)
  }, [selectedMovie, selectedSeries, allMovies])

  const categoryItems = useMemo(() => {
    if (categoryType === "movie") return movies
    if (categoryType === "series") return series
    return anime
  }, [categoryType, movies, series, anime])

  const categoryTitles: Record<string, string> = {
    movie: t("common.movies"),
    series: t("common.series"),
    anime: t("common.anime"),
  }

  if (view === "detail" && selectedMovie) {
    return (
      <PageTransition key="detail">
        <Suspense fallback={<PageFallback />}>
          <MovieDetailPage
            movie={selectedMovie}
            related={relatedMovies}
            onBack={() => goHome()}
            onPlay={handlePlay}
            onMovieClick={handleMovieClick}
            onActorClick={handleActorClick}
          />
        </Suspense>
      </PageTransition>
    )
  }

  if (view === "actor" && selectedActorId) {
    return (
      <PageTransition key="actor">
        <Suspense fallback={<PageFallback />}>
          <ActorPage
            actorId={selectedActorId}
            onBack={() => goHome()}
            onCreditClick={handleCreditClick}
          />
        </Suspense>
      </PageTransition>
    )
  }

  if (view === "player" && selectedMovie) {
    return (
      <PageTransition key="player">
        <Suspense fallback={<PageFallback />}>
          <PlayerPage
            movie={selectedMovie}
            episodes={episodeList}
            seriesId={selectedSeries?.id}
            onBack={() => goHome()}
            onPlayMovie={handlePlay}
          />
        </Suspense>
      </PageTransition>
    )
  }

  if (view === "category") {
    return (
      <PageTransition key="category">
        <Suspense fallback={<PageFallback />}>
          <CategoryPage
            type={categoryType}
            title={categoryTitles[categoryType]}
            items={categoryItems}
            onClose={() => goHome()}
            onPlay={handlePlay}
            onDetails={handleDetails}
            initialGenre={categoryGenre}
          />
        </Suspense>
        {detailsOpen && (
          <Suspense fallback={null}>
            <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} />
          </Suspense>
        )}
      </PageTransition>
    )
  }

  if (view === "search") {
    return (
      <PageTransition key="search">
        <Suspense fallback={<PageFallback />}>
          <SearchPage
            query={searchQuery}
            onQueryChange={setSearchQuery}
            results={searchResults}
            isLoading={searchLoading}
            onClose={() => {
              setSearchQuery("")
              setSearchResults([])
              goHome()
            }}
            onPlay={handlePlay}
            onDetails={handleDetails}
            selectedGenres={selectedGenres}
            onGenreToggle={handleGenreToggle}
            selectedQualities={selectedQualities}
            onQualityToggle={handleQualityToggle}
            selectedTypes={selectedTypes}
            onTypeToggle={handleTypeToggle}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onReset={handleFilterReset}
            filterOpen={filterOpen}
            onFilterOpenChange={setFilterOpen}
          />
        </Suspense>
        {detailsOpen && (
          <Suspense fallback={null}>
            <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} />
          </Suspense>
        )}
      </PageTransition>
    )
  }

  if (view === "library") {
    return (
      <PageTransition key="library">
        <Suspense fallback={<PageFallback />}>
          <LibraryPage
            onClose={() => {
              goHome()
            }}
            movies={moviesByType.movies}
            series={moviesByType.series}
            anime={moviesByType.anime}
            allItems={allMovies}
            onPlay={handlePlay}
            onDetails={handleDetails}
          />
        </Suspense>
        {detailsOpen && (
          <Suspense fallback={null}>
            <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} />
          </Suspense>
        )}
      </PageTransition>
    )
  }

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen message={error} />

  return (
    <PageTransition key="home">
      <div className="min-h-screen bg-black">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNavigate={handleNavigate}
          currentPage={currentPage}
          hasSeries={series.length > 0}
          hasAnime={anime.length > 0}
        />

        <main className="pb-12 sm:pb-16">
          {visibleHero && (
            <div className="full-bleed relative min-h-[68svh] overflow-hidden bg-black sm:min-h-[90vh] lg:min-h-screen">
              {exitingHero && (
                <HeroSection
                  key={`exit-${exitingHero.id}`}
                  movie={exitingHero}
                  onPlay={handlePlay}
                  onDetails={handleDetails}
                  phase="exit"
                />
              )}
              <HeroSection
                key={`enter-${visibleHero.id}`}
                movie={visibleHero}
                onPlay={handlePlay}
                onDetails={handleDetails}
                phase="enter"
              />
            </div>
          )}

          <div className="relative z-20 -mt-12 space-y-5 sm:-mt-14 sm:space-y-10">
            {homeCategories.map((category, index) => {
              const onViewAll = buildViewAll(
                category,
                { t, movies, series, anime, categoryTitles, setCategoryType, setCategoryGenre, setCurrentPage, setPath, setView }
              )
              return (
                <Fragment key={category.title}>
                  <MovieCarousel
                    title={category.title}
                    items={category.items}
                    onPlay={handlePlay}
                    onDetails={handleDetails}
                    onViewAll={onViewAll}
                  />
                  {/* "Continue watching" sits right after the first row (Películas) rather
                      than above everything, so it doesn't compete with the hero for attention. */}
                  {index === 0 && continueWatchingItems.length > 0 && (
                    <MovieCarousel
                      title={t("home.continue")}
                      items={continueWatchingItems.map(({ movie }) => movie)}
                      onPlay={handlePlay}
                      onDetails={handleDetails}
                      getProgressRatio={(movie) => continueWatchingProgressById.get(movie.id)}
                    />
                  )}
                </Fragment>
              )
            })}
          </div>
        </main>

        {detailsOpen && (
          <Suspense fallback={null}>
            <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} />
          </Suspense>
        )}
      </div>
    </PageTransition>
  )
}

function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-fade">{children}</div>
}

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <Spinner className="size-6 text-neutral-500" />
    </div>
  )
}

function LoadingScreen() {
  const scrollViewport = useScrollViewport()

  // Block scrolling while loading. This used to toggle overflow on
  // html/body, which drops the native scrollbar and shifts all content
  // sideways by its width for as long as loading takes — the ScrollArea
  // viewport has its own custom (non-native, layout-neutral) scrollbar, so
  // locking overflow here never moves anything.
  useEffect(() => {
    if (!scrollViewport) return
    const previousOverflow = scrollViewport.style.overflow
    const previousOverscroll = scrollViewport.style.overscrollBehavior
    scrollViewport.style.overflow = "hidden"
    scrollViewport.style.overscrollBehavior = "none"
    return () => {
      scrollViewport.style.overflow = previousOverflow
      scrollViewport.style.overscrollBehavior = previousOverscroll
    }
  }, [scrollViewport])

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-black text-center overscroll-none touch-none">
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <FlickTextLoader />
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  const { t } = useI18n()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4">
      <div className="flex size-16 items-center justify-center rounded-full bg-neutral-900 transition-transform hover:scale-110">
        <span className="text-2xl text-neutral-600">!</span>
      </div>
      <p className="text-sm text-neutral-400">{message}</p>
      <button
        onClick={() => window.location.reload()}
        className="cursor-pointer rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-300 transition-all hover:scale-105 hover:bg-neutral-900 hover:text-white active:scale-95"
      >
        {t("common.retry")}
      </button>
    </div>
  )
}

