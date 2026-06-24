"use client"

import { useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import MovieCard from "@/components/MovieCard"
import FilterSidebar from "@/components/FilterSidebar"
import { Search, ArrowLeft, X, TrendingUp, Clock, Star } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import { translateGenre } from "@/i18n/translations"

interface SearchPageProps {
  query: string
  onQueryChange: (query: string) => void
  results: Movie[]
  isLoading: boolean
  onClose: () => void
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  onFavorite?: (movie: Movie) => void
  selectedGenres: string[]
  onGenreToggle: (genre: string) => void
  selectedQualities: string[]
  onQualityToggle: (quality: string) => void
  selectedTypes: string[]
  onTypeToggle: (type: string) => void
  sortBy: string
  onSortChange: (sort: string) => void
  onReset: () => void
  filterOpen: boolean
  onFilterOpenChange: (open: boolean) => void
}


export default function SearchPage({
  query,
  onQueryChange,
  results,
  isLoading,
  onClose,
  onPlay,
  onDetails,
  onFavorite,
  selectedGenres,
  onGenreToggle,
  selectedQualities,
  onQualityToggle,
  selectedTypes,
  onTypeToggle,
  sortBy,
  onSortChange,
  onReset,
  filterOpen,
  onFilterOpenChange,
}: SearchPageProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { lang, t } = useI18n()
  const suggestions = ["Acción", "Comedia", "Terror", "Anime", "4K", "Series", "Drama", "Ciencia Ficción", "Suspenso", "Documental"]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="min-h-screen bg-black">
      {/* Fixed Search Header */}
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
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
            <Input
              ref={inputRef}
              placeholder={t("common.searchContent")}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="h-10 border-neutral-800 bg-neutral-900/50 pl-10 text-base text-white placeholder:text-neutral-500 transition-all focus:border-neutral-600"
            />
            {query && (
              <button
                onClick={() => onQueryChange("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500 transition-all hover:scale-110 hover:text-white"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <FilterSidebar
            open={filterOpen}
            onOpenChange={onFilterOpenChange}
            selectedGenres={selectedGenres}
            onGenreToggle={onGenreToggle}
            selectedQualities={selectedQualities}
            onQualityToggle={onQualityToggle}
            selectedTypes={selectedTypes}
            onTypeToggle={onTypeToggle}
            sortBy={sortBy}
            onSortChange={onSortChange}
            onReset={onReset}
          />
        </div>
      </div>

      {/* Content */}
      <div className="pt-16">
        {isLoading ? (
          /* Loading skeleton */
          <div className="mx-auto max-w-[1920px] px-4 pt-8 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[2/3] w-full rounded-xl bg-neutral-900" />
                  <Skeleton className="h-4 w-3/4 rounded bg-neutral-900" />
                  <Skeleton className="h-3 w-1/2 rounded bg-neutral-900" />
                </div>
              ))}
            </div>
          </div>
        ) : query && results.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center px-4 pt-24 animate-fade-in">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-neutral-900">
              <Search className="size-6 text-neutral-600" />
            </div>
            <h3 className="mb-1 text-lg font-medium text-white">
              {t("search.noTitle")}
            </h3>
            <p className="max-w-sm text-center text-sm text-neutral-500">
              {t("search.noDescription", { query })}
            </p>
          </div>
        ) : !query ? (
          /* Initial explore state */
          <div className="mx-auto max-w-[1920px] px-4 pt-8 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-col items-center justify-center py-12 animate-fade-up">
              <div className="mb-4 flex size-20 items-center justify-center rounded-full border border-white/10 bg-neutral-900/50">
                <Search className="size-8 text-neutral-600" />
              </div>
              <h3 className="mb-2 text-xl font-medium text-white">
                {t("search.exploreTitle")}
              </h3>
              <p className="max-w-md text-center text-sm text-neutral-500">
                {t("search.exploreDescription")}
              </p>
            </div>

            {/* Trending suggestions */}
            <div className="mb-6 animate-fade-up stagger-2">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="size-4 text-neutral-500" />
                <h2 className="text-sm font-medium text-neutral-400">
                  {t("search.suggestions")}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onQueryChange(tag)}
                    className="rounded-full border border-neutral-800 bg-neutral-900/50 px-4 py-1.5 text-sm text-neutral-400 transition-all hover:scale-105 hover:border-neutral-700 hover:text-white active:scale-95"
                  >
                    {translateGenre(tag, lang)}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick filters */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 animate-fade-up stagger-3">
              {[
                { label: t("search.mostViewed"), icon: TrendingUp },
                { label: t("search.justAdded"), icon: Clock },
                { label: t("search.topRated"), icon: Star },
              ].map((item) => (
                <button
                  key={item.label}
                  className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 transition-all hover:scale-105 hover:border-neutral-700 hover:bg-neutral-900 active:scale-95"
                >
                  <item.icon className="size-5 text-neutral-500" />
                  <span className="text-sm text-neutral-300">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Results */
          <div className="mx-auto max-w-[1920px] px-4 pt-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center justify-between animate-fade-up">
              <p className="text-sm text-neutral-500">
                {t("search.resultsFor", { count: results.length, suffix: results.length !== 1 && lang !== "hi" && lang !== "zh" ? "s" : "", query })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {results.map((movie, i) => (
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
          </div>
        )}
      </div>
    </div>
  )
}
