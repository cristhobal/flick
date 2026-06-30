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
        <div className="content-container flex h-14 items-center gap-2 sm:h-16 sm:gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-neutral-400 transition-all hover:scale-110 hover:text-white active:scale-95"
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
              className="h-10 border-neutral-800 bg-neutral-900/50 pl-10 text-sm text-white placeholder:text-neutral-500 transition-all focus:border-neutral-600 sm:text-base"
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
      <div className="pt-14 sm:pt-16">
        {isLoading ? (
          <div className="content-container pt-6 sm:pt-8">
            <div className="responsive-card-grid">
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
          <div className="flex flex-col items-center justify-center px-4 pt-20 animate-fade-in sm:pt-24">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-neutral-900 sm:size-16">
              <Search className="size-5 text-neutral-600 sm:size-6" />
            </div>
            <h3 className="mb-1 text-base font-medium text-white sm:text-lg">
              {t("search.noTitle")}
            </h3>
            <p className="max-w-xs text-center text-sm text-neutral-500 sm:max-w-sm">
              {t("search.noDescription", { query })}
            </p>
          </div>
        ) : !query ? (
          <div className="content-container pt-6 sm:pt-8">
            <div className="mb-8 flex flex-col items-center justify-center py-8 animate-fade-up sm:py-12">
              <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-white/10 bg-neutral-900/50 sm:size-20">
                <Search className="size-6 text-neutral-600 sm:size-8" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-white sm:text-xl">
                {t("search.exploreTitle")}
              </h3>
              <p className="max-w-xs text-center text-sm text-neutral-500 sm:max-w-md">
                {t("search.exploreDescription")}
              </p>
            </div>

            {/* Trending suggestions */}
            <div className="mb-6 animate-fade-up stagger-2">
              <div className="mb-3 flex items-center gap-2 sm:mb-4">
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
                    className="rounded-full border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs text-neutral-400 transition-all hover:scale-105 hover:border-neutral-700 hover:text-white active:scale-95 sm:px-4 sm:text-sm"
                  >
                    {translateGenre(tag, lang)}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick filters */}
            <div className="grid grid-cols-1 gap-3 animate-fade-up stagger-3 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
              {[
                { label: t("search.mostViewed"), icon: TrendingUp },
                { label: t("search.justAdded"), icon: Clock },
                { label: t("search.topRated"), icon: Star },
              ].map((item) => (
                <button
                  key={item.label}
                  className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/30 p-3 transition-all hover:scale-105 hover:border-neutral-700 hover:bg-neutral-900 active:scale-95 sm:gap-3 sm:p-4"
                >
                  <item.icon className="size-4 shrink-0 text-neutral-500 sm:size-5" />
                  <span className="text-xs text-neutral-300 sm:text-sm">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="content-container pt-5 sm:pt-6">
            <div className="mb-4 flex items-center justify-between animate-fade-up sm:mb-6">
              <p className="text-xs text-neutral-500 sm:text-sm">
                {t("search.resultsFor", { count: results.length, suffix: results.length !== 1 && lang !== "hi" && lang !== "zh" ? "s" : "", query })}
              </p>
            </div>
            <div className="responsive-card-grid">
              {results.map((movie, i) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onPlay={onPlay}
                  onDetails={onDetails}
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
