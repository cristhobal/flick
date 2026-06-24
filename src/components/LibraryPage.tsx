"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import MovieCard from "@/components/MovieCard"
import { Search, ArrowLeft } from "lucide-react"
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
}

type Tab = "all" | "movies" | "series" | "anime"


export default function LibraryPage({
  onClose,
  movies,
  series,
  anime,
  allItems,
  onPlay,
  onDetails,
  onFavorite,
}: LibraryPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const { t } = useI18n()
  const [librarySearch, setLibrarySearch] = useState("")

  const availableTabs = useMemo(() => {
    const tabs: { id: Tab; label: string }[] = [{ id: "all", label: t("library.everything") }]
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
      <div className="sticky top-16 z-30 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[1920px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-neutral-400 transition-all hover:scale-110 hover:text-white active:scale-95"
              onClick={onClose}
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-white">{t("library.title")}</h1>
              <p className="text-xs text-neutral-500">
                {t("library.count", { count: allItems.length })}
              </p>
            </div>
            <div className="flex-1" />
            <div className="relative hidden w-full max-w-xs sm:block">
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

      {/* Library Content */}
      <div className="mx-auto max-w-[1920px] px-4 pt-6 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="mb-6 inline-flex items-center gap-1 rounded-lg bg-neutral-900 p-1">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <TabGrid
          items={currentItems()}
          onPlay={onPlay}
          onDetails={onDetails}
          onFavorite={onFavorite}
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
}: {
  items: Movie[]
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  onFavorite?: (movie: Movie) => void
}) {
  const { t } = useI18n()
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-neutral-900">
          <Search className="size-6 text-neutral-600" />
        </div>
        <p className="text-sm text-neutral-500">
          {t("common.noResults")}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((movie, i) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          onPlay={onPlay}
          onDetails={onDetails}
          onFavorite={onFavorite}
          index={i}
        />
      ))}
    </div>
  )
}
