import type { Movie } from "@/lib/data"

export type ContentRouteType = "movie" | "series" | "anime"

export interface ParsedContentRoute {
  view: "detail" | "watch"
  type: ContentRouteType
  tmdbId: number
  season?: number
  episode?: number
}

function routeType(type: Movie["type"]): ContentRouteType {
  return type === "movie" ? "movie" : type
}

export function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "titulo"
}

export function contentPath(movie: Movie): string {
  const type = routeType(movie.type)
  const base = `/${type}/${movie.tmdbId}-${slugifyTitle(movie.seriesTitle || movie.title)}`
  if (movie.seasonNumber && movie.episodeNumber) {
    return `${base}/season-${movie.seasonNumber}/episode-${movie.episodeNumber}`
  }
  return base
}

export function watchPath(movie: Movie): string {
  const type = routeType(movie.type)
  const base = `/watch/${type}/${movie.tmdbId}-${slugifyTitle(movie.seriesTitle || movie.title)}`
  if (movie.seasonNumber && movie.episodeNumber) {
    return `${base}/season-${movie.seasonNumber}/episode-${movie.episodeNumber}`
  }
  return base
}

export function parseContentRoute(pathname: string): ParsedContentRoute | null {
  const parts = pathname.split("/").filter(Boolean)
  const isWatch = parts[0] === "watch"
  const offset = isWatch ? 1 : 0
  const type = parts[offset] as ContentRouteType | undefined
  const idPart = parts[offset + 1]

  if (!type || !["movie", "series", "anime"].includes(type) || !idPart) return null
  const idMatch = idPart.match(/^(\d+)/)
  if (!idMatch) return null

  const route: ParsedContentRoute = {
    view: isWatch ? "watch" : "detail",
    type,
    tmdbId: Number(idMatch[1]),
  }

  const seasonMatch = parts[offset + 2]?.match(/^season-(\d+)$/)
  const episodeMatch = parts[offset + 3]?.match(/^episode-(\d+)$/)
  if (seasonMatch && episodeMatch) {
    route.season = Number(seasonMatch[1])
    route.episode = Number(episodeMatch[1])
  }

  return route
}

export function samePath(path: string): boolean {
  return typeof window !== "undefined" && window.location.pathname === path
}
