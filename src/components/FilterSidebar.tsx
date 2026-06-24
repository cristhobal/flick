"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  SlidersHorizontal,
  ArrowUpDown,
  Calendar,
  Star,
  Clock,
} from "lucide-react"
import { useI18n } from "@/i18n/I18nProvider"
import { translateGenre } from "@/i18n/translations"

interface FilterSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedGenres: string[]
  onGenreToggle: (genre: string) => void
  selectedQualities: string[]
  onQualityToggle: (quality: string) => void
  selectedTypes: string[]
  onTypeToggle: (type: string) => void
  sortBy: string
  onSortChange: (sort: string) => void
  onReset: () => void
}

const genres = [
  "Acción",
  "Terror",
  "Comedia",
  "Drama",
  "Ciencia Ficción",
  "Suspenso",
  "Aventura",
  "Fantasía",
  "Documental",
  "Crimen",
]

const qualities = ["4K", "1080p", "720p", "4K HDR", "1080p HDR"]



export default function FilterSidebar({
  open,
  onOpenChange,
  selectedGenres,
  onGenreToggle,
  selectedQualities,
  onQualityToggle,
  selectedTypes,
  onTypeToggle,
  sortBy,
  onSortChange,
  onReset,
}: FilterSidebarProps) {
  const { lang, t } = useI18n()
  const types = [
    { value: "Películas", label: t("common.movies") },
    { value: "Series", label: t("common.series") },
    { value: "Anime", label: t("common.anime") },
  ]
  const sortOptions = [
    { id: "recent", label: t("filters.recent"), icon: Calendar },
    { id: "rating", label: t("filters.rating"), icon: Star },
    { id: "duration", label: t("filters.duration"), icon: Clock },
  ]
  const activeFilters =
    selectedGenres.length + selectedQualities.length + selectedTypes.length

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative gap-2 border-neutral-800 text-neutral-300 transition-all hover:scale-105 hover:bg-neutral-800 hover:text-white active:scale-95"
        >
          <SlidersHorizontal className="size-4" />
          {t("filters.title")}
          {activeFilters > 0 && (
            <Badge className="ml-1 h-5 min-w-5 rounded-full border-0 bg-white px-1.5 text-[10px] text-black">
              {activeFilters}
            </Badge>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent
        className="w-full border-neutral-800 bg-neutral-950 sm:max-w-sm"
      >
        <DrawerHeader className="border-b border-neutral-800 pb-4">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-lg text-white">{t("filters.title")}</DrawerTitle>
            <Button
              variant="ghost"
              size="xs"
              className="text-xs text-neutral-500 hover:text-white"
              onClick={onReset}
            >
              {t("filters.clear")}
            </Button>
          </div>
          <DrawerDescription className="sr-only">
            {t("filters.description")}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-4">
            {/* Sort */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <ArrowUpDown className="size-4" />
                {t("filters.sortBy")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {sortOptions.map((option) => {
                  const Icon = option.icon
                  return (
                    <Button
                      key={option.id}
                      variant={sortBy === option.id ? "default" : "outline"}
                      size="xs"
                      className={
                        sortBy === option.id
                          ? "border-0 bg-white text-black hover:bg-neutral-200"
                          : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      }
                      onClick={() => onSortChange(option.id)}
                    >
                      <Icon className="size-3" />
                      {option.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* Type */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-white">{t("filters.type")}</h3>
              <div className="flex flex-wrap gap-2">
                {types.map((type) => (
                  <Button
                    key={type.value}
                    variant={
                      selectedTypes.includes(type.value) ? "default" : "outline"
                    }
                    size="xs"
                    className={
                      selectedTypes.includes(type.value)
                        ? "border-0 bg-white text-black hover:bg-neutral-200"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }
                    onClick={() => onTypeToggle(type.value)}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* Genre */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-white">{t("filters.genre")}</h3>
              <div className="flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <Button
                    key={genre}
                    variant={
                      selectedGenres.includes(genre) ? "default" : "outline"
                    }
                    size="xs"
                    className={
                      selectedGenres.includes(genre)
                        ? "border-0 bg-white text-black hover:bg-neutral-200"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }
                    onClick={() => onGenreToggle(genre)}
                  >
                    {translateGenre(genre, lang)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* Quality */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-white">{t("filters.quality")}</h3>
              <div className="flex flex-wrap gap-2">
                {qualities.map((quality) => (
                  <Button
                    key={quality}
                    variant={
                      selectedQualities.includes(quality)
                        ? "default"
                        : "outline"
                    }
                    size="xs"
                    className={
                      selectedQualities.includes(quality)
                        ? "border-0 bg-white text-black hover:bg-neutral-200"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }
                    onClick={() => onQualityToggle(quality)}
                  >
                    {quality}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
                      onClick={() => onSortChange(option.id)}
                    >
                      <Icon className="size-3" />
                      {option.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* Type */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-white">{t("filters.type")}</h3>
              <div className="flex flex-wrap gap-2">
                {types.map((type) => (
                  <Button
                    key={type.value}
                    variant={
                      selectedTypes.includes(type.value) ? "default" : "outline"
                    }
                    size="xs"
                    className={
                      selectedTypes.includes(type.value)
                        ? "border-0 bg-white text-black hover:bg-neutral-200"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }
                    onClick={() => onTypeToggle(type.value)}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* Genre */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-white">{t("filters.genre")}</h3>
              <div className="flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <Button
                    key={genre}
                    variant={
                      selectedGenres.includes(genre) ? "default" : "outline"
                    }
                    size="xs"
                    className={
                      selectedGenres.includes(genre)
                        ? "border-0 bg-white text-black hover:bg-neutral-200"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }
                    onClick={() => onGenreToggle(genre)}
                  >
                    {translateGenre(genre, lang)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {/* Quality */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-white">{t("filters.quality")}</h3>
              <div className="flex flex-wrap gap-2">
                {qualities.map((quality) => (
                  <Button
                    key={quality}
                    variant={
                      selectedQualities.includes(quality)
                        ? "default"
                        : "outline"
                    }
                    size="xs"
                    className={
                      selectedQualities.includes(quality)
                        ? "border-0 bg-white text-black hover:bg-neutral-200"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }
                    onClick={() => onQualityToggle(quality)}
                  >
                    {quality}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
