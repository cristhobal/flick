"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import MovieCard from "@/components/MovieCard"
import { Search, ArrowLeft, X } from "lucide-react"
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
}: LibraryPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const { t } = useI18n()
  const [librarySearch, setLibrarySearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

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
      <div className="sticky top-14 z-30 border-b border-white/5 bg-black/80 backdrop-blur-xl sm:top-16">
        <div className="content-container py-3 sm:py-4">
          <div className="flex h-10 items-center gap-2 sm:h-11 sm:gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-neutral-400 transition-all hover:scale-110 hover:text-white active:scale-95"
              onClick={onClose}
            >
              <ArrowLeft className="size-5" />
            </Button>

            <div className={`min-w-0 flex-1 transition-all duration-300 ${searchOpen ? "opacity-0 sm:opacity-100" : "opacity-100"}`}>
              <h1 className="truncate text-base font-semibold text-white sm:text-lg">{t("library.title")}</h1>
              <p className="truncate text-[11px] text-neutral-500 sm:text-xs">
                {t("library.count", { count: allItems.length })}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <div className="relative flex min-w-0 items-center">
                <div
                  className={`flex cursor-pointer items-center overflow-hidden rounded-lg transition-all duration-300 ease-in-out ${
                    searchOpen
                      ? "w-[min(12rem,calc(100vw-7rem))] border border-neutral-800 bg-neutral-900/70 sm:w-48 sm:bg-neutral-900/50 lg:w-64"
                      : "w-9"
                  }`}
                  onClick={() => {
                    if (!searchOpen) setSearchOpen(true)
                  }}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10">
                    <Search className="size-4 text-neutral-500" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={t("library.filter")}
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    className={`h-9 min-w-0 bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none transition-all duration-300 ${
                      searchOpen ? "w-full pr-2 opacity-100" : "w-0 p-0 opacity-0"
                    }`}
                  />
                  {searchOpen && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (librarySearch) {
                          setLibrarySearch("")
                        } else {
                          setSearchOpen(false)
                        }
                      }}
                      className="mr-2 shrink-0 text-neutral-500 hover:text-white"
                      aria-label="Cerrar busqueda"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="content-container pt-4 sm:pt-6">
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

        <TabGrid
          items={currentItems()}
          onPlay={onPlay}
          onDetails={onDetails}
        />
      </div>
    </div>
  )
}

function TabGrid({
  items,
  onPlay,
  onDetails,
}: {
  items: Movie[]
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
}) {
  const { t } = useI18n()
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-neutral-900 sm:size-16">
          <Search className="size-5 text-neutral-600 sm:size-6" />
        </div>
        <p className="text-sm text-neutral-500">{t("common.noResults")}</p>
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
          index={i}
        />
      ))}
    </div>
  )
}