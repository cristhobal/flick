"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import Header from "@/components/Header"
import HeroSection from "@/components/HeroSection"
import MovieCarousel from "@/components/MovieCarousel"
import MovieDetailsModal from "@/components/MovieDetailsModal"
import FlickTextLoader from "@/components/FlickTextLoader"
import SearchPage from "@/components/SearchPage"
import LibraryPage from "@/components/LibraryPage"
import PlayerPage from "@/components/PlayerPage"
import CategoryPage from "@/components/CategoryPage"
import MovieDetailPage from "@/components/MovieDetailPage"
import { useTMDB } from "@/lib/use-tmdb"
import { useFavorites } from "@/lib/use-favorites"
import { getPlayableMovie, type Movie } from "@/lib/data"
import { categoryPath, contentPath, parseBrowseRoute, parseContentRoute, samePath, sectionPath, slugifyTitle, watchPath } from "@/lib/routes"
import { useI18n } from "@/i18n/I18nProvider"
import { translateGenre } from "@/i18n/translations"

type PageView = "home" | "search" | "library" | "player" | "category" | "detail"

const HERO_ROTATION_MS = 15_000
const HERO_EXIT_MS = 720
const HERO_MIN_RATING = 6.5
const HERO_POPULAR_POOL_SIZE = 80

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
  const tmdb = useTMDB()
  const favorites = useFavorites()
  const { allMovies, loading, error, hero: tmdbHero, categories } = tmdb

  const [currentPage, setCurrentPage] = useState("home")
  const [view, setView] = useState<PageView>("home")
  const [categoryType, setCategoryType] = useState<"movie" | "series" | "anime">("movie")
  const [categoryGenre, setCategoryGenre] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Movie[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedQualities, setSelectedQualities] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [sortBy, setSortBy] = useState("recent")
  const [heroMovieId, setHeroMovieId] = useState<string | null>(null)
  const [visibleHero, setVisibleHero] = useState<Movie | null>(null)
  const [exitingHero, setExitingHero] = useState<Movie | null>(null)

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
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath])

  const hasHeroSynopsis = useCallback((item: Movie | null | undefined) => {
    const description = (item?.description || item?.longDescription || "").trim()
    if (description.length < 24) return false
    return description !== t("movie.fallback")
  }, [t])

  const tmdbHeroCandidates = useMemo(
    () => allMovies
      .filter((item) =>
        item.rating >= HERO_MIN_RATING &&
        (item.backdropPath || item.posterPath) &&
        hasHeroSynopsis(item)
      )
      .sort((a, b) => b.year - a.year || b.rating - a.rating)
      .slice(0, HERO_POPULAR_POOL_SIZE),
    [allMovies, hasHeroSynopsis]
  )

  const chooseDifferentTmdbHero = useCallback((currentId: string | null) => {
    const alternatives = tmdbHeroCandidates.filter((movie) => movie.id !== currentId)
    const pool = alternatives.length > 0 ? alternatives : tmdbHeroCandidates
    return pool[Math.floor(Math.random() * pool.length)]?.id || null
  }, [tmdbHeroCandidates])

  useEffect(() => {
    if (tmdbHeroCandidates.length === 0) {
      setHeroMovieId((currentId) => currentId)
      return
    }
    setHeroMovieId((currentId) => {
      if (currentId && tmdbHeroCandidates.some((movie) => movie.id === currentId)) {
        return currentId
      }

      const tmdbHeroCandidate = tmdbHero
        ? tmdbHeroCandidates.find((movie) => movie.tmdbId === tmdbHero.tmdbId)
        : undefined

      return chooseDifferentTmdbHero(tmdbHeroCandidate?.id || currentId)
    })
  }, [tmdbHeroCandidates, tmdbHero?.tmdbId, chooseDifferentTmdbHero])

  useEffect(() => {
    if (view !== "home" || tmdbHeroCandidates.length < 2) return
    const rotationTimer = window.setInterval(() => {
      setHeroMovieId((currentId) => chooseDifferentTmdbHero(currentId || tmdbHero?.id || null))
    }, HERO_ROTATION_MS)
    return () => window.clearInterval(rotationTimer)
  }, [tmdbHeroCandidates, view, chooseDifferentTmdbHero, tmdbHero?.id])

  const hero = useMemo(() => {
    const selected = tmdbHeroCandidates.find((movie) => movie.id === heroMovieId)
    if (selected && tmdbHero?.tmdbId === selected.tmdbId && tmdbHero.duration !== "-") {
      return { ...selected, duration: tmdbHero.duration, durationSeconds: tmdbHero.durationSeconds, trailerUrl: selected.trailerUrl || tmdbHero.trailerUrl }
    }
    return selected || null
  }, [heroMovieId, tmdbHero, tmdbHeroCandidates, hasHeroSynopsis])

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
    if (!searchQuery.trim()) {
      setSearchResults([])
      setView("home")
      return
    }

    if (view !== "search") setView("search")
    setSearchLoading(true)
    tmdb.search(searchQuery).then((results) => {
      setSearchResults(results)
      setSearchLoading(false)
    })
  }, [searchQuery, tmdb.search])

  const genreFromSlug = useCallback((items: Movie[], genreSlug: string | null) => {
    if (!genreSlug) return null
    return items
      .flatMap((item) => item.genre.split(",").map((genre) => genre.trim()).filter(Boolean))
      .find((genre) => slugifyTitle(genre) === genreSlug) || null
  }, [])

  useEffect(() => {
    const applyRoute = () => {
      const contentRoute = parseContentRoute(window.location.pathname)
      if (contentRoute) {
        const baseItem = allMovies.find((movie) => movie.tmdbId === contentRoute.tmdbId && movie.type === contentRoute.type)
        const item = contentRoute.season && contentRoute.episode
          ? baseItem?.seriesEpisodes?.find((episode) =>
              episode.seasonNumber === contentRoute.season && episode.episodeNumber === contentRoute.episode
            ) || baseItem
          : baseItem
        if (!item) return
        setSelectedMovie(item)
        setView(contentRoute.view === "watch" ? "player" : "detail")
        setCurrentPage(contentRoute.type === "movie" ? "movies" : contentRoute.type)
        window.scrollTo({ top: 0, behavior: "instant" })
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
        window.scrollTo({ top: 0, behavior: "instant" })
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
  }, [allMovies, genreFromSlug, tmdb.anime, tmdb.movies, tmdb.series])

  const handleNavigate = useCallback((page: string) => {
    if (page === "home") {
      goHome()
    } else if (page === "library") {
      setView("library")
      setCurrentPage(page)
      setPath("/library")
    } else if (page === "movies") {
      setCategoryType("movie")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("movies")
      setPath(sectionPath("movie"))
    } else if (page === "series") {
      setCategoryType("series")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("series")
      setPath(sectionPath("series"))
    } else if (page === "anime") {
      setCategoryType("anime")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("anime")
      setPath(sectionPath("anime"))
    } else {
      setCurrentPage(page)
    }
  }, [goHome, setPath])

  const handlePlay = useCallback((movie: Movie) => {
    const playable = getPlayableMovie(movie)
    if (!playable) return
    setSelectedMovie(playable)
    setView("player")
    setPath(watchPath(playable))
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath])

  const handleDetails = useCallback((movie: Movie) => {
    setSelectedMovie(movie)
    setView("detail")
    setPath(contentPath(movie))
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath])

  const handleMovieClick = useCallback((movie: Movie) => {
    setSelectedMovie(movie)
    setView("detail")
    setPath(contentPath(movie))
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [setPath])

  const handleFavorite = useCallback((movie: Movie) => {
    void favorites.toggleFavorite(movie)
  }, [favorites])
  const favoriteAction = favorites.blocked ? undefined : handleFavorite

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
        <MovieDetailPage
          movie={selectedMovie}
          related={relatedMovies}
          onBack={() => goHome()}
          onPlay={handlePlay}
          onMovieClick={handleMovieClick}
          onFavorite={favoriteAction}
          isFavorite={favorites.isFavorite}
        />
      </PageTransition>
    )
  }

  if (view === "player" && selectedMovie) {
    return (
      <PageTransition key="player">
        <PlayerPage
          movie={selectedMovie}
          related={relatedMovies}
          episodes={episodeList}
          onBack={() => goHome()}
          onPlayMovie={handlePlay}
        />
      </PageTransition>
    )
  }

  if (view === "category") {
    return (
      <PageTransition key="category">
        <CategoryPage
          type={categoryType}
          title={categoryTitles[categoryType]}
          items={categoryItems}
          onClose={() => goHome()}
          onPlay={handlePlay}
          onDetails={handleDetails}
          onFavorite={favoriteAction}
          isFavorite={favorites.isFavorite}
          initialGenre={categoryGenre}
        />
        <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} onFavorite={favoriteAction} isFavorite={selectedMovie ? favorites.isFavorite(selectedMovie) : false} />
      </PageTransition>
    )
  }

  if (view === "search") {
    return (
      <PageTransition key="search">
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
          onFavorite={favoriteAction}
          isFavorite={favorites.isFavorite}
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
        <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} onFavorite={favoriteAction} isFavorite={selectedMovie ? favorites.isFavorite(selectedMovie) : false} />
      </PageTransition>
    )
  }

  if (view === "library") {
    return (
      <PageTransition key="library">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNavigate={handleNavigate}
          currentPage={currentPage}
          hasSeries={series.length > 0}
          hasAnime={anime.length > 0}
        />
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
          onFavorite={favoriteAction}
          isFavorite={favorites.isFavorite}
          favoritesBlocked={favorites.blocked}
        />
        <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} onFavorite={favoriteAction} isFavorite={selectedMovie ? favorites.isFavorite(selectedMovie) : false} />
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
            <div className="relative min-h-[68svh] overflow-hidden bg-black sm:min-h-[90vh] lg:min-h-screen">
              {exitingHero && (
                <HeroSection
                  key={`exit-${exitingHero.id}`}
                  movie={exitingHero}
                  onPlay={handlePlay}
                  onDetails={handleDetails}
                  onFavorite={favoriteAction}
                  isFavorite={favorites.isFavorite(exitingHero)}
                  phase="exit"
                />
              )}
              <HeroSection
                key={`enter-${visibleHero.id}`}
                movie={visibleHero}
                onPlay={handlePlay}
                onDetails={handleDetails}
                onFavorite={favoriteAction}
                isFavorite={favorites.isFavorite(visibleHero)}
                phase="enter"
              />
            </div>
          )}

          <div className="relative z-20 -mt-12 space-y-8 sm:-mt-14 sm:space-y-10">
            {homeCategories.map((category) => {
              const onViewAll = buildViewAll(
                category,
                { t, movies, series, anime, categoryTitles, setCategoryType, setCategoryGenre, setCurrentPage, setPath, setView }
              )
              return (
                <MovieCarousel
                  key={category.title}
                  title={category.title}
                  items={category.items}
                  onPlay={handlePlay}
                  onDetails={handleDetails}
                  onFavorite={favoriteAction}
                  isFavorite={favorites.isFavorite}
                  onViewAll={onViewAll}
                />
              )
            })}
          </div>
        </main>

        <MovieDetailsModal movie={selectedMovie} open={detailsOpen} onOpenChange={setDetailsOpen} onPlay={handlePlay} onFavorite={favoriteAction} isFavorite={selectedMovie ? favorites.isFavorite(selectedMovie) : false} />
      </div>
    </PageTransition>
  )
}

function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>
}

function LoadingScreen() {
  useEffect(() => {
    const htmlOverflow = document.documentElement.style.overflow
    const bodyOverflow = document.body.style.overflow
    const bodyOverscroll = document.body.style.overscrollBehavior

    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"

    return () => {
      document.documentElement.style.overflow = htmlOverflow
      document.body.style.overflow = bodyOverflow
      document.body.style.overscrollBehavior = bodyOverscroll
    }
  }, [])

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
        className="rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-300 transition-all hover:scale-105 hover:bg-neutral-900 hover:text-white active:scale-95"
      >
        {t("common.retry")}
      </button>
    </div>
  )
}

