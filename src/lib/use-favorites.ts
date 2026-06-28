"use client"

import { createElement, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { Movie } from "@/lib/data"
import FavoriteToast from "@/components/FavoriteToast"
import { useI18n } from "@/i18n/I18nProvider"

function favoriteKey(movie: Pick<Movie, "type" | "tmdbId">): string {
  return `${movie.type}:${movie.tmdbId}`
}

export function useFavorites() {
  const { t } = useI18n()
  const [available, setAvailable] = useState(false)
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let cancelled = false
    fetch("/api/favorites")
      .then((response) => response.json())
      .then((data: { available?: boolean; favorites?: string[] }) => {
        if (cancelled) return
        setAvailable(Boolean(data.available))
        setFavoriteKeys(new Set(data.favorites || []))
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const isFavorite = useCallback((movie: Pick<Movie, "type" | "tmdbId">) => {
    return favoriteKeys.has(favoriteKey(movie))
  }, [favoriteKeys])

  const toggleFavorite = useCallback(async (movie: Movie) => {
    if (!available) return

    const key = favoriteKey(movie)
    const nextIsFavorite = !favoriteKeys.has(key)
    setFavoriteKeys((current) => {
      const next = new Set(current)
      if (nextIsFavorite) next.add(key)
      else next.delete(key)
      return next
    })

    try {
      const response = await fetch("/api/favorites", {
        method: nextIsFavorite ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextIsFavorite ? movie : { type: movie.type, tmdbId: movie.tmdbId }),
      })
      const data = await response.json() as { available?: boolean; ok?: boolean }
      if (!response.ok || !data.available || !data.ok) throw new Error("Favorites unavailable")

      toast.custom(() =>
        createElement(FavoriteToast, {
          movie,
          title: nextIsFavorite ? t("favorites.addedTitle") : t("favorites.removedTitle"),
          genreFallback: t("favorites.genreFallback"),
          typeLabel: movie.type === "movie" ? t("common.movies") : movie.type === "series" ? t("common.series") : t("common.anime"),
        }), {
        duration: 3200,
      })
    } catch {
      setAvailable(false)
      setFavoriteKeys((current) => {
        const next = new Set(current)
        if (nextIsFavorite) next.delete(key)
        else next.add(key)
        return next
      })
    }
  }, [available, favoriteKeys, t])

  return useMemo(() => ({
    available,
    isFavorite,
    toggleFavorite,
  }), [available, isFavorite, toggleFavorite])
}
