"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import Header from "@/components/Header"
import HeroSection from "@/components/HeroSection"
import MovieCarousel from "@/components/MovieCarousel"
import MovieDetailsModal from "@/components/MovieDetailsModal"
import SearchPage from "@/components/SearchPage"
import LibraryPage from "@/components/LibraryPage"
import PlayerPage from "@/components/PlayerPage"
import CategoryPage from "@/components/CategoryPage"
import MovieDetailPage from "@/components/MovieDetailPage"
import { useLocalMovies } from "@/lib/use-local-movies"
import { useTMDB } from "@/lib/use-tmdb"
import { useConfig } from "@/lib/use-config"
import { getPlayableMovie, type Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { INTL_LOCALES, translateGenre } from "@/i18n/translations"

type PageView = "home" | "search" | "library" | "player" | "category" | "detail"

const HERO_ROTATION_MS = 15_000



// ---- Helper: resolve the "Ver todo" action for each carousel section ----
interface ViewAllCtx {
  t: (key: string) => string
  movies: Movie[]
  series: Movie[]
  anime: Movie[]
  categoryTitles: Record<string, string>
  setCategoryType: (t: "movie" | "series" | "anime") => void
  setCategoryGenre: (g: string | null) => void
  setCurrentPage: (p: string) => void
  setView: (v: "home" | "search" | "library" | "player" | "category" | "detail") => void
}

function buildViewAll(
  category: { title: string; items: Movie[] },
  ctx: ViewAllCtx
): (() => void) | undefined {
  const { t, movies, series, anime, setCategoryType, setCategoryGenre, setCurrentPage, setView } = ctx

  // Favorites — no view all
  if (category.items.length === 0) return undefined

  const title = category.title

  // Anime section
  if (title === t("common.anime")) {
    if (anime.length === 0) return undefined
    return () => {
      setCategoryType("anime")
      setCategoryGenre(null)
      setCurrentPage("anime")
      setView("category")
    }
  }

  // Series section
  if (title === t("common.series")) {
    if (series.length === 0) return undefined
    return () => {
      setCategoryType("series")
      setCategoryGenre(null)
      setCurrentPage("series")
      setView("category")
    }
  }

  // Genre-specific sections (action, horror, comedy, or any local genre)
  // Detect by checking if any item carries a genre that matches the section title
  // We use the first item's genre list as a heuristic, then confirm with the pool
  const knownGenreKeys: { key: string; genre: string }[] = [
    { key: "home.action", genre: "Action" },
    { key: "home.horror",  genre: "Horror" },
    { key: "home.comedy",  genre: "Comedy" },
  ]

  for (const { key, genre } of knownGenreKeys) {
    if (title === t(key)) {
      // Find the raw genre value used in the movies data
      const genreInData = category.items
        .flatMap((m) => m.genre.split(",").map((g) => g.trim()))
        .find((g) => g.toLowerCase().includes(genre.toLowerCase()))
      if (!genreInData) return undefined
      return () => {
        setCategoryType("movie")
        setCategoryGenre(genreInData)
        setCurrentPage("movies")
        setView("category")
      }
    }
  }

  // Generic movie sections (featured, recent, continue watching, catalog, local genres)
  // For local genres: the category title matches a translated genre — find the raw genre value
  if (category.items.every((m) => m.type === "movie" || !m.type)) {
    // Try to find a common genre from the items that matches the category title
    const rawGenre = category.items
      .flatMap((m) => m.genre.split(",").map((g) => g.trim()))
      .find((g) => {
        // Check if the translated genre matches the section title
        return g.toLowerCase() === title.toLowerCase()
      })

    if (rawGenre) {
      return () => {
        setCategoryType("movie")
        setCategoryGenre(rawGenre)
        setCurrentPage("movies")
        setView("category")
      }
    }

    // General movie sections (featured, recent, continue watching)
    if (movies.length > 0) {
      return () => {
        setCategoryType("movie")
        setCategoryGenre(null)
        setCurrentPage("movies")
        setView("category")
      }
    }
  }

  return undefined
}

export default function HomePage() {
  const { lang, t } = useI18n()
  const { dataSource, loading: configLoading } = useConfig()
  const local = useLocalMovies()
  const tmdb = useTMDB()

  const { allMovies, loading, error, hero: tmdbHero, categories: tmdbCategories } =
    dataSource === "tmdb"
      ? { ...tmdb, hero: tmdb.hero, categories: tmdb.categories }
      : { ...local, hero: null, categories: [] }

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

  const categories = useMemo(() => {
    if (dataSource === "tmdb") return tmdbCategories

    const byGenre = new Map<string, Movie[]>()

    for (const movie of allMovies) {
      for (const genre of movie.genre.split(",").map((item) => item.trim()).filter(Boolean)) {
        const items = byGenre.get(genre) || []
        items.push(movie)
        byGenre.set(genre, items)
      }
    }

    const result: { title: string; items: Movie[] }[] = []

    // Track which movie ids have already been used so sections don't repeat content
    const usedIds = new Set<string>()
    const pickUnused = (pool: Movie[], limit: number): Movie[] => {
      const picked: Movie[] = []
      for (const m of pool) {
        if (!usedIds.has(m.id)) {
          picked.push(m)
          usedIds.add(m.id)
          if (picked.length >= limit) break
        }
      }
      return picked
    }

    // "Destacadas" — top of the list, avoid genre sections stealing the same items
    if (allMovies.length > 0) {
      const featured = pickUnused(allMovies, 20)
      result.push({ title: t("home.featured"), items: featured })
    }

    // "Recientes" — sorted by year, different pool
    const sortedByYear = [...allMovies].sort((a, b) => b.year - a.year)
    const recent = pickUnused(sortedByYear, 20)
    if (recent.length > 0) {
      result.push({ title: t("home.recent"), items: recent })
    }

    // Genre sections — each genre uses only its own movies (may overlap with above by genre, but not same items)
    for (const genre of [...byGenre.keys()].sort((a, b) => a.localeCompare(b, INTL_LOCALES[lang]))) {
      const genreMovies = byGenre.get(genre) || []
      const items = genreMovies.filter((m) => !usedIds.has(m.id)).slice(0, 20)
      if (items.length > 0) {
        for (const m of items) usedIds.add(m.id)
        result.push({ title: translateGenre(genre, lang), items })
      }
    }

    // "Catálogo" — anything left over
    const remaining = allMovies.filter((m) => !usedIds.has(m.id)).slice(0, 30)
    if (remaining.length > 0) {
      result.push({ title: t("common.catalog"), items: remaining })
    }
    return result
  }, [allMovies, tmdbCategories, dataSource, lang, t])

  const heroCandidates = useMemo(
    () => dataSource === "tmdb" ? [] : allMovies.filter((item) => item.type === "movie"),
    [allMovies, dataSource]
  )

  const tmdbHeroCandidates = useMemo(
    () => dataSource === "tmdb"
      ? allMovies.filter((item) => item.backdropPath || item.posterPath)
      : [],
    [allMovies, dataSource]
  )

  const chooseDifferentMovie = useCallback((currentId: string | null) => {
    const alternatives = heroCandidates.filter((movie) => movie.id !== currentId)
    const pool = alternatives.length > 0 ? alternatives : heroCandidates
    return pool[Math.floor(Math.random() * pool.length)].id
  }, [heroCandidates])

  const chooseDifferentTmdbHero = useCallback((currentId: string | null) => {
    const alternatives = tmdbHeroCandidates.filter((movie) => movie.id !== currentId)
    const pool = alternatives.length > 0 ? alternatives : tmdbHeroCandidates
    return pool[Math.floor(Math.random() * pool.length)]?.id || null
  }, [tmdbHeroCandidates])

  // Elige una pelicula aleatoria siempre que la lista de candidatos cargue (recarga incluida)
  useEffect(() => {
    if (dataSource === "tmdb") return
    if (heroCandidates.length === 0) {
      setHeroMovieId(null)
      return
    }
    setHeroMovieId(chooseDifferentMovie(null))
  // Solo re-ejecutar cuando pasan de 0 candidatos a tener al menos 1, no en cada re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, heroCandidates.length === 0])

  useEffect(() => {
    if (dataSource !== "tmdb") return
    if (tmdbHeroCandidates.length === 0) {
      setHeroMovieId(tmdbHero?.id || null)
      return
    }
    setHeroMovieId((currentId) => chooseDifferentTmdbHero(currentId || tmdbHero?.id || null))
  // Solo cambiar cuando TMDB termina de cargar nuevos candidatos o cambia el hero base.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, tmdbHeroCandidates.length, tmdbHero?.id])

  // Rotar el hero cada HERO_ROTATION_MS mientras se esta en la vista home
  useEffect(() => {
    if (dataSource === "tmdb" || view !== "home" || heroCandidates.length < 2) return
    const rotationTimer = window.setInterval(() => {
      setHeroMovieId((currentId) => chooseDifferentMovie(currentId))
    }, HERO_ROTATION_MS)
    return () => window.clearInterval(rotationTimer)
  }, [heroCandidates, view, dataSource, chooseDifferentMovie])

  useEffect(() => {
    if (dataSource !== "tmdb" || view !== "home" || tmdbHeroCandidates.length < 2) return
    const rotationTimer = window.setInterval(() => {
      setHeroMovieId((currentId) => chooseDifferentTmdbHero(currentId || tmdbHero?.id || null))
    }, HERO_ROTATION_MS)
    return () => window.clearInterval(rotationTimer)
  }, [tmdbHeroCandidates, view, dataSource, chooseDifferentTmdbHero, tmdbHero?.id])

  const hero = useMemo(
    () => dataSource === "tmdb"
      ? (tmdbHeroCandidates.find((movie) => movie.id === heroMovieId) || tmdbHero)
      : (heroCandidates.find((movie) => movie.id === heroMovieId) || null),
    [heroCandidates, heroMovieId, tmdbHero, tmdbHeroCandidates, dataSource]
  )

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setView("home")
      return
    }

    if (view !== "search") setView("search")
    setSearchLoading(true)

    if (dataSource === "tmdb") {
      tmdb.search(searchQuery).then((results) => {
        setSearchResults(results)
        setSearchLoading(false)
      })
      return
    }

    const query = searchQuery.toLowerCase()
    setSearchResults(
      allMovies.filter(
        (movie) =>
          movie.title.toLowerCase().includes(query) ||
          movie.genre.toLowerCase().includes(query) ||
          movie.year.toString().includes(query)
      )
    )
    setSearchLoading(false)
  }, [searchQuery, allMovies, dataSource, tmdb.search])

  const handleNavigate = useCallback((page: string) => {
    if (page === "favorites") return

    if (page === "home") {
      setView("home")
      setCurrentPage("home")
    } else if (page === "library") {
      setView("library")
      setCurrentPage(page)
    } else if (page === "movies") {
      setCategoryType("movie")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("movies")
    } else if (page === "series") {
      setCategoryType("series")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("series")
    } else if (page === "anime") {
      setCategoryType("anime")
      setCategoryGenre(null)
      setView("category")
      setCurrentPage("anime")
    } else {
      setCurrentPage(page)
    }
  }, [])

  const handlePlay = useCallback((movie: Movie) => {
    const playable = getPlayableMovie(movie)
    if (!playable) return

    setSelectedMovie(playable)
    setView("player")
  }, [])

  const handleDetails = useCallback((movie: Movie) => {
    setSelectedMovie(movie)
    setView("detail")
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [])

  const handleMovieClick = useCallback((movie: Movie) => {
    setSelectedMovie(movie)
    setView("detail")
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [])


  const handleFilterReset = useCallback(() => {
    setSelectedGenres([])
    setSelectedQualities([])
    setSelectedTypes([])
    setSortBy("recent")
  }, [])

  const handleGenreToggle = useCallback((genre: string) => {
    setSelectedGenres((previous) =>
      previous.includes(genre)
        ? previous.filter((item) => item !== genre)
        : [...previous, genre]
    )
  }, [])

  const handleQualityToggle = useCallback((quality: string) => {
    setSelectedQualities((previous) =>
      previous.includes(quality)
        ? previous.filter((item) => item !== quality)
        : [...previous, quality]
    )
  }, [])

  const handleTypeToggle = useCallback((type: string) => {
    setSelectedTypes((previous) =>
      previous.includes(type)
        ? previous.filter((item) => item !== type)
        : [...previous, type]
    )
  }, [])

  const movies = useMemo(
    () => dataSource === "tmdb" ? tmdb.movies : allMovies.filter((item) => item.type === "movie"),
    [allMovies, tmdb.movies, dataSource]
  )
  const series = useMemo(
    () => dataSource === "tmdb" ? tmdb.series : allMovies.filter((item) => item.type === "series"),
    [allMovies, tmdb.series, dataSource]
  )
  const anime = useMemo(
    () => dataSource === "tmdb" ? tmdb.anime : allMovies.filter((item) => item.type === "anime"),
    [allMovies, tmdb.anime, dataSource]
  )

  const moviesByType = useMemo(() => ({ movies, series, anime }), [movies, series, anime])

  const selectedSeries = useMemo(() => {
    if (!selectedMovie) return undefined
    if (selectedMovie.seriesEpisodes) return selectedMovie
    if (!selectedMovie.seriesTitle) return undefined
    return allMovies.find(
      (item) => item.title === selectedMovie.seriesTitle && item.seriesEpisodes
    )
  }, [selectedMovie, allMovies])

  const episodeList = useMemo(
    () => selectedSeries?.seriesEpisodes || [],
    [selectedSeries]
  )

  const relatedMovies = useMemo(() => {
    if (!selectedMovie) return []

    const reference = selectedSeries || selectedMovie
    const referenceGenres = new Set(
      reference.genre.split(",").map((genre) => genre.trim()).filter(Boolean)
    )

    if (reference.type === "movie") {
      return allMovies.filter(
        (item) =>
          item.type === "movie" &&
          item.id !== reference.id &&
          item.genre.split(",").some((genre) => referenceGenres.has(genre.trim()))
      ).slice(0, 10)
    }

    return allMovies.filter(
      (item) =>
        item.id !== reference.id &&
        item.type === reference.type &&
        Boolean(item.seriesEpisodes) &&
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
          onBack={() => { setView("home"); window.scrollTo({ top: 0, behavior: "instant" }) }}
          onPlay={handlePlay}
          onMovieClick={handleMovieClick}
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
          onBack={() => setView("home")}
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
          onClose={() => { setView("home"); setCurrentPage("home") }}
          onPlay={handlePlay}
          onDetails={handleDetails}
          initialGenre={categoryGenre}
        />
        <MovieDetailsModal
          movie={selectedMovie}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onPlay={handlePlay}
        />
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
            setView("home")
            setSearchQuery("")
            setSearchResults([])
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
        <MovieDetailsModal
          movie={selectedMovie}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onPlay={handlePlay}
        />
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
            setView("home")
            setCurrentPage("home")
          }}
          movies={moviesByType.movies}
          series={moviesByType.series}
          anime={moviesByType.anime}
          allItems={allMovies}
          onPlay={handlePlay}
          onDetails={handleDetails}
        />
        <MovieDetailsModal
          movie={selectedMovie}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onPlay={handlePlay}
        />
      </PageTransition>
    )
  }

  if (loading || configLoading) return <LoadingScreen />
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

        <main className="pb-16">
          {hero && (
            <HeroSection
              key={hero.id}
              movie={hero}
              onPlay={handlePlay}
              onDetails={handleDetails}
            />
          )}

          <div className="relative z-20 -mt-16 space-y-10">
            {categories.map((category) => {
              const onViewAll = buildViewAll(
                category,
                { t, movies, series, anime, categoryTitles,
                  setCategoryType, setCategoryGenre, setCurrentPage, setView }
              )
              return (
                <MovieCarousel
                  key={category.title}
                  title={category.title}
                  items={category.items}
                  onPlay={handlePlay}
                  onDetails={handleDetails}
                  onViewAll={onViewAll}
                />
              )
            })}
          </div>
        </main>

        <MovieDetailsModal
          movie={selectedMovie}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onPlay={handlePlay}
        />
      </div>
    </PageTransition>
  )
}

function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>
}

function LoadingScreen() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black">
      <div className="relative size-12">
        <div className="absolute inset-0 animate-pulse rounded-full border-2 border-white/10 bg-white/5" />
        <div className="absolute inset-1 animate-pulse rounded-full border border-white/5 bg-white/3" style={{ animationDelay: "0.15s" }} />
        <div className="absolute inset-[6px] animate-pulse rounded-full bg-white/5" style={{ animationDelay: "0.3s" }} />
      </div>
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-neutral-600">{t("common.loading")}</p>
        <div className="h-1 w-48 overflow-hidden rounded-full bg-neutral-900">
          <div className="h-full w-1/2 animate-shimmer rounded-full" />
        </div>
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
