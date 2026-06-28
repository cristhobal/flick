"use client"

import { useRef } from "react"
import MovieCard from "@/components/MovieCard"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Movie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"

interface MovieCarouselProps {
  title: string
  items: Movie[]
  onPlay?: (movie: Movie) => void
  onDetails?: (movie: Movie) => void
  onFavorite?: (movie: Movie) => void
  onViewAll?: () => void
}

export default function MovieCarousel({
  title,
  items,
  onPlay,
  onDetails,
  onFavorite,
  onViewAll,
}: MovieCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  const isFavorites = items.length === 0 && [t("nav.favorites"), "Favoritos", "Favorites"].includes(title)

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    // Use a percentage of container width for smooth, device-appropriate scrolling
    const scrollAmount = Math.max(container.clientWidth * 0.75, 200)
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    })
  }

  return (
    <section className={`group/row relative ${isFavorites ? "opacity-55" : ""}`}>
      <div className="mb-3 flex items-center justify-between px-3 sm:mb-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg md:text-xl">
            {title}
          </h2>
          {isFavorites && (
            <span className="shrink-0 rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              {t("common.comingSoon")}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="xs"
          disabled={isFavorites || !onViewAll}
          onClick={onViewAll}
          className="shrink-0 text-xs text-neutral-500 transition-all hover:text-white disabled:opacity-30"
        >
          {t("common.viewAll")}
        </Button>
      </div>

      {isFavorites && items.length === 0 ? (
        <div className="mx-3 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/60 px-5 py-8 text-sm text-neutral-600 sm:mx-6 lg:mx-8">
          {t("favorites.unavailable")}
        </div>
      ) : (
        <div className="relative">
          {/* Left fade + arrow */}
          <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 flex w-12 items-center opacity-0 transition-all duration-500 group-hover/row:opacity-100 sm:pointer-events-auto sm:w-16">
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 ml-1 size-8 text-neutral-400 transition-all hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 sm:size-10"
              onClick={() => scroll("left")}
            >
              <ChevronLeft className="size-4 sm:size-5" />
            </Button>
          </div>

          {/* Scrollable track */}
          <div
            ref={scrollRef}
            className="hide-scrollbar flex flex-nowrap gap-2 overflow-x-auto px-3 pb-4 scroll-smooth sm:gap-3 sm:px-6 lg:px-8"
          >
            {items.map((movie, i) => (
              <div
                key={movie.id}
                className="w-[140px] shrink-0 snap-start sm:w-[160px] md:w-[180px] lg:w-[200px] xl:w-[210px] 2xl:w-[220px]"
              >
                <MovieCard
                  movie={movie}
                  onPlay={onPlay}
                  onDetails={onDetails}
                  onFavorite={onFavorite}
                  index={i}
                />
              </div>
            ))}
          </div>

          {/* Right fade + arrow */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 flex w-12 items-center justify-end opacity-0 transition-all duration-500 group-hover/row:opacity-100 sm:pointer-events-auto sm:w-16">
            <div className="absolute inset-0 bg-gradient-to-l from-black/70 via-black/30 to-transparent" />
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 mr-1 size-8 text-neutral-400 transition-all hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 sm:size-10"
              onClick={() => scroll("right")}
            >
              <ChevronRight className="size-4 sm:size-5" />
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
