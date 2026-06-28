"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import MovieCard from "@/components/MovieCard"
import { Search, ArrowLeft, Star, X } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"

interface LibraryPageProps {
  onClose: () => void
  movies: Movie[]
  series: Movie[]
  anime: Movie[]
  allItems: Movie[]
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  onFavorite?: (movie: Movie) => void
  isFavorite?: (movie: Movie) => boolean
}

type Tab = "all" | "favorites" | "movies" | "series" | "anime"

export default function LibraryPage({
  onClose,
  movies,
  series,
  anime,
  allItems,
  onPlay,
  onDetails,
  onFavorite,
  isFavorite,
}: LibraryPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const { t } = useI18n()
  const [librarySearch, setLibrarySearch] = useState("")
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const favoriteItems = useMemo(
    () => allItems.filter((item) => isFavorite?.(item)),
    [allItems, isFavorite]
  )

  const availableTabs = useMemo(() => {
    const tabs: { id: Tab; label: string }[] = [{ id: "all", label: t("library.everything") }]
    tabs.push({ id: "favorites", label: t("nav.favorites") })
    if (movies.length > 0) tabs.push({ id: "movies", label: t("common.movies") })
    if (series.length > 0) tabs.push({ id: "series", label: t("common.series") })
    if (anime.length > 0) tabs.push({ id: "anime", label: t("common.anime") })
    return tabs
  }, [movies.length, series.length, anime.length, t])

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("all")
    }
  }, [activeTab, availableTabs])

  const filterItems = (items: Movie[]) =>
    items.filter(
      (m) =>
        m.title.toLowerCase().includes(librarySearch.toLowerCase()) ||
        m.genre.toLowerCase().includes(librarySearch.toLowerCase())
    )

  const currentItems = () => {
    const source =
      activeTab === "all"
        ? allItems
        : activeTab === "favorites"
          ? favoriteItems
        : activeTab === "movies"
          ? movies
          : activeTab === "series"
            ? series
            : anime
    return filterItems(source)
  }

  return (
    <div className="min-h-screen bg-black pb-16">
      {/* Library Header */}
      <div className="sticky top-14 z-30 border-b border-white/5 bg-black/80 backdrop-blur-xl sm:top-16">
        <div className="content-container py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-neutral-400 transition-all hover:scale-110 hover:text-white active:scale-95"
              onClick={onClose}
            >
              <ArrowLeft className="size-5" />
            </Button>

            {/* Title — hide when mobile search open */}
            {!mobileSearchOpen && (
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold text-white sm:text-lg">{t("library.title")}</h1>
                <p className="text-[11px] text-neutral-500 sm:text-xs">
                  {t("library.count", { count: allItems.length })}
                </p>
              </div>
            )}

            {/* Mobile search inline */}
            {mobileSearchOpen && (
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
                <Input
                  autoFocus
                  placeholder={t("library.filter")}
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="h-9 border-neutral-800 bg-neutral-900/50 pl-9 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-600"
                />
              </div>
            )}

            <div className="flex shrink-0 items-center gap-1">
              {!mobileSearchOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={`hidden h-9 gap-2 rounded-lg px-3 text-xs transition-all sm:inline-flex ${
                    activeTab === "favorites"
                      ? "bg-white text-black hover:bg-neutral-900 hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                      : "text-neutral-400 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => setActiveTab(activeTab === "favorites" ? "all" : "favorites")}
                >
                  <Star className={`size-4 ${activeTab === "favorites" ? "fill-black text-black group-hover/button:fill-white group-hover/button:text-white" : "fill-transparent text-neutral-400"}`} />
                  {t("nav.favorites")}
                </Button>
              )}

              {/* Mobile search toggle */}
              {!mobileSearchOpen && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("nav.favorites")}
                  aria-pressed={activeTab === "favorites"}
                  className={`sm:hidden ${
                    activeTab === "favorites"
                      ? "bg-white text-black hover:bg-neutral-900 hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                      : "text-neutral-400 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => setActiveTab(activeTab === "favorites" ? "all" : "favorites")}
                >
                  <Star className={`size-4 ${activeTab === "favorites" ? "fill-black text-black group-hover/button:fill-white group-hover/button:text-white" : "fill-transparent"}`} />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon-sm"
                className="text-neutral-400 sm:hidden"
                onClick={() => {
                  setMobileSearchOpen(!mobileSearchOpen)
                  if (mobileSearchOpen) setLibrarySearch("")
                }}
              >
                {mobileSearchOpen ? <X className="size-4" /> : <Search className="size-4" />}
              </Button>

              {/* Desktop search */}
              <div className="relative hidden w-48 sm:block lg:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
                <Input
                  placeholder={t("library.filter")}
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="h-9 border-neutral-800 bg-neutral-900/50 pl-9 text-sm text-white placeholder:text-neutral-500 transition-all focus:border-neutral-600"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Library Content */}
      <div className="content-container pt-4 sm:pt-6">
        {/* Tabs */}
        <div className="mb-5 flex items-center gap-1 overflow-x-auto pb-1 sm:mb-6">
          <div className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 p-1">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap sm:px-4 ${
                  activeTab === tab.id
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <TabGrid
          items={currentItems()}
          onPlay={onPlay}
          onDetails={onDetails}
          onFavorite={onFavorite}
          isFavorite={isFavorite}
          emptyMessage={activeTab === "favorites" ? t("favorites.empty") : undefined}
        />
      </div>
    </div>
  )
}

function TabGrid({
  items,
  onPlay,
  onDetails,
  onFavorite,
  isFavorite,
  emptyMessage,
}: {
  items: Movie[]
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  onFavorite?: (movie: Movie) => void
  isFavorite?: (movie: Movie) => boolean
  emptyMessage?: string
}) {
  const { t } = useI18n()
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-neutral-900 sm:size-16">
          <Search className="size-5 text-neutral-600 sm:size-6" />
        </div>
        <p className="text-sm text-neutral-500">
          {emptyMessage || t("common.noResults")}
        </p>
      </div>
    )
  }

  return (
    <div className="responsive-card-grid">
      {items.map((movie, i) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          onPlay={onPlay}
          onDetails={onDetails}
          onFavorite={onFavorite}
          isFavorite={isFavorite?.(movie)}
          index={i}
        />
      ))}
    </div>
  )
}
