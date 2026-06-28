export interface Movie {
  id: string
  tmdbId: number
  title: string
  year: number
  duration: string
  durationSeconds?: number
  quality: string
  rating: number
  genre: string
  language: string[]
  subtitles: string[]
  description: string
  longDescription: string
  type: "movie" | "series" | "anime"
  director?: string
  contentRating: string
  seasons?: number
  episodes?: number
  posterPath: string | null
  backdropPath: string | null
  seriesTitle?: string
  episodeNumber?: number
  seasonNumber?: number
  totalEpisodes?: number
  seasonTitle?: string
  episodeTitle?: string
  episodeSynopsis?: string
  seriesEpisodes?: Movie[]
  seasonList?: { season: number; title?: string; episodes: Movie[] }[]
  totalSeasons?: number
  trailerUrl?: string
}

export interface Category {
  title: string
  items: Movie[]
}

export function getPlayableMovie(movie: Movie): Movie | null {
  if (movie.trailerUrl) return movie
  return movie.seriesEpisodes?.find((episode) => Boolean(episode.trailerUrl)) || null
}

export function isPlayableMovie(movie: Movie): boolean {
  return getPlayableMovie(movie) !== null
}

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342"): string | null {
  if (!path) return null
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export function backdropUrl(path: string | null, size: "w780" | "w1280" | "original" = "w1280"): string | null {
  if (!path) return null
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export function getGenreGradient(genre: string): string {
  const normalized = genre.toLowerCase()
  if (normalized.includes("horror") || normalized.includes("terror")) return "from-neutral-800 to-black"
  if (normalized.includes("comedy") || normalized.includes("comedia")) return "from-neutral-600 to-neutral-900"
  if (normalized.includes("animation") || normalized.includes("anime")) return "from-neutral-700 to-neutral-950"
  if (normalized.includes("science") || normalized.includes("sci") || normalized.includes("ficci")) return "from-neutral-600 to-neutral-950"
  return "from-neutral-700 to-neutral-950"
}
