"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import MovieCard from "@/components/MovieCard"
import { ArrowLeft, Search, Film, Tv, Clapperboard } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { INTL_LOCALES, translateGenre } from "@/i18n/translations"

interface CategoryPageProps {
  type: "movie" | "series" | "anime"
  title: string
  items: Movie[]
  onClose: () => void
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  onFavorite?: (movie: Movie) => void
  initialGenre?: string | null
}


export default function CategoryPage({
  type,
  title,
  items,
  onClose,
  onPlay,
  onDetails,
  onFavorite,
  initialGenre = null,
}: CategoryPageProps) {
  const [search, setSearch] = useState("")
  const { lang, t } = useI18n()
  const sortOptions = [
    { id: "recent", label: t("category.recent") },
    { id: "rating", label: t("category.rating") },
    { id: "alpha", label: t("category.alpha") },
  ]
  const [activeGenre, setActiveGenre] = useState<string | null>(initialGenre ?? null)
  const [sortBy, setSortBy] = useState("recent")
  const initialGenreRef = useState(initialGenre)[0]

  const Icon = type === "movie" ? Film : type === "series" ? Tv : Clapperboard

  const genres = useMemo(
    () =>
      [...new Set(
        items.flatMap((item) =>
          item.genre
            .split(",")
            .map((genre) => genre.trim())
            .filter(Boolean)
        )
      )].sort((a, b) => a.localeCompare(b, INTL_LOCALES[lang])),
    [items, lang]
  )

  useEffect(() => {
    setActiveGenre(initialGenreRef ?? null)
    setSearch("")
  }, [type, initialGenreRef])

  useEffect(() => {
    if (activeGenre && !genres.includes(activeGenre)) {
      setActiveGenre(null)
    }
  }, [activeGenre, genres])

  useEffect(() => {
    setActiveGenre(initialGenre ?? null)
  }, [initialGenre])

  const filtered = items
    .filter((m) => {
      if (search && !m.title.toLowerCase().includes(search.toLowerCase()))
        return false
      if (
        activeGenre &&
        !m.genre.split(",").map((genre) => genre.trim()).includes(activeGenre)
      ) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === "rating") return b.rating - a.rating
      if (sortBy === "alpha") return a.title.localeCompare(b.title)
      return b.year - a.year
    })


  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="fixed top-0 right-0 left-0 z-40 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1920px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-neutral-400 transition-all hover:scale-110 hover:text-white active:scale-95"
            onClick={onClose}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-white" />
            <h1 className="text-lg font-semibold text-white">{title}</h1>
            <Badge
              variant="secondary"
              className="ml-1 border-0 bg-neutral-800 text-[11px] text-neutral-400"
            >
              {items.length}
            </Badge>
          </div>
          <div className="flex-1" />
          <div className="relative hidden w-full max-w-xs md:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
            <Input
              placeholder={t("category.filter", { title: title.toLowerCase() })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-neutral-800 bg-neutral-900/50 pl-9 text-sm text-white placeholder:text-neutral-500 transition-all focus:border-neutral-600"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="pt-16">
        {/* Genre + Sort bar */}
        <div className="sticky top-16 z-30 border-b border-white/5 bg-neutral-950/90 backdrop-blur-md">
          <div className="mx-auto max-w-[1920px] px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wider text-neutral-600 sm:block">
                  {t("category.categories")}
                </span>
                <div className="hide-scrollbar min-w-0 flex-1 overflow-x-auto">
                  <div className="flex w-max items-center gap-1.5 pr-4">
                    {[t("common.all"), ...genres].map((genre, index) => {
                      const isActive = index === 0 ? !activeGenre : activeGenre === genre
                      return (
                        <button
                          key={index === 0 ? "all" : genre}
                          onClick={() =>
                            setActiveGenre(
                              index === 0 ? null : activeGenre === genre ? null : genre
                            )
                          }
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? "bg-white text-black"
                              : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                          }`}
                        >
                          {index === 0 ? genre : translateGenre(genre, lang)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-white/5 pt-3">
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                  {t("category.sort")}
                </span>
                <div className="hide-scrollbar min-w-0 flex-1 overflow-x-auto">
                  <div className="flex w-max items-center gap-1">
                    {sortOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setSortBy(option.id)}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          sortBy === option.id
                            ? "bg-neutral-800 text-white"
                            : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="mx-auto max-w-[1920px] px-4 py-6 sm:px-6 lg:px-8">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
              <Search className="mb-4 size-8 text-neutral-600" />
              <p className="text-sm text-neutral-500">
                {t("common.noResults")}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-6 text-xs text-neutral-600">
                {t("category.count", { shown: filtered.length, total: items.length })}
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filtered.map((movie, i) => (
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
