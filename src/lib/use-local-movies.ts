import { useState, useEffect } from "react"
import type { Movie, EmbeddedTrack } from "@/lib/data"

interface LocalMovieFromJSON {
  id: string
  tmdbId: number
  title: string
  year: number
  quality: string
  rating: number
  genre: string
  description: string
  longDescription: string
  posterPath: string | null
  backdropPath: string | null
  type: "movie" | "series" | "anime"
  duration: string
  durationSeconds?: number
  language: string[]
  subtitles: string[]
  contentRating: string
  videoFile: string
  subFiles: { lang: string; file: string }[]
  fileSize: number
  embeddedAudio?: EmbeddedTrack[]
  embeddedSubs?: EmbeddedTrack[]
  seriesTitle?: string
  episodeNumber?: number
  seasonNumber?: number
  totalEpisodes?: number
  episodeSynopsis?: string
}

const CONTENT_RATINGS = ["+7", "+13", "+14", "+16", "+18", "R", "PG-13", "TV-MA"]

const SERIES_SYNOPSIS: Record<string, string> = {
  "Smoking Behind the Supermarket with You":
    "Sasaki, un oficinista agotado por el trabajo, encuentra su único alivio en las visitas a un supermercado donde lo atiende Yamada. Una noche conoce detrás del local a Tayama, una joven de personalidad directa que lo invita a fumar con ella. Sin darse cuenta de la conexión entre ambas, Sasaki comienza a compartir con Tayama conversaciones y momentos cotidianos que transforman lentamente su rutina.",
}

function enrich(m: LocalMovieFromJSON): Movie {
  return {
    id: m.id,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.year,
    duration: m.duration,
    durationSeconds: m.durationSeconds,
    quality: m.quality,
    rating: m.rating,
    genre: m.genre,
    language: m.language.length > 0 ? m.language : ["Español"],
    subtitles: m.subtitles.length > 0 ? m.subtitles : [],
    description: m.description,
    longDescription: m.longDescription,
    type: m.type || "movie",
    contentRating: m.contentRating || CONTENT_RATINGS[Math.abs(m.tmdbId) % CONTENT_RATINGS.length],
    posterPath: m.posterPath,
    backdropPath: m.backdropPath,
    videoFile: m.videoFile,
    subFiles: m.subFiles,
    fileSize: m.fileSize,
    embeddedAudio: m.embeddedAudio,
    embeddedSubs: m.embeddedSubs,
    seriesTitle: m.seriesTitle,
    episodeNumber: m.episodeNumber,
    seasonNumber: m.seasonNumber,
    episodeTitle: m.seriesTitle ? m.title : undefined,
    episodeSynopsis: m.episodeSynopsis,
    totalEpisodes: m.totalEpisodes,
  }
}

function groupLibrary(items: Movie[]): Movie[] {
  const standalone: Movie[] = []
  const seriesGroups = new Map<string, Movie[]>()

  for (const item of items) {
    if (!item.seriesTitle) {
      standalone.push(item)
      continue
    }

    const episodes = seriesGroups.get(item.seriesTitle) || []
    episodes.push(item)
    seriesGroups.set(item.seriesTitle, episodes)
  }

  const groupedSeries = [...seriesGroups.entries()].map(([seriesTitle, episodes]) => {
    const sortedEpisodes = [...episodes].sort(
      (a, b) => (a.seasonNumber || 1) - (b.seasonNumber || 1) || (a.episodeNumber || 0) - (b.episodeNumber || 0)
    )

    // Build seasons array
    const seasonMap = new Map<number, Movie[]>()
    for (const ep of sortedEpisodes) {
      const s = ep.seasonNumber || 1
      if (!seasonMap.has(s)) seasonMap.set(s, [])
      seasonMap.get(s)!.push(ep)
    }
    const seasonsArr = [...seasonMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([num, eps]) => ({ season: num, title: `Temporada ${num}`, episodes: eps }))

    const firstEpisode = sortedEpisodes[0]
    const synopsis = SERIES_SYNOPSIS[seriesTitle]
      || sortedEpisodes.find((episode) => !episode.longDescription.startsWith("Episodio "))?.longDescription
      || `${seriesTitle} reúne ${sortedEpisodes.length} episodios disponibles en tu biblioteca.`

    return {
      ...firstEpisode,
      id: `series-${seriesTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: seriesTitle,
      description: synopsis,
      longDescription: synopsis,
      duration: `${sortedEpisodes.length} episodios`,
      durationSeconds: firstEpisode.durationSeconds,
      seasons: seasonsArr.length,
      totalSeasons: seasonsArr.length,
      episodes: sortedEpisodes.length,
      totalEpisodes: sortedEpisodes.length,
      seriesEpisodes: sortedEpisodes,
      seasonList: seasonsArr,
    }
  })

  return [...standalone, ...groupedSeries].sort(
    (a, b) => b.year - a.year || a.title.localeCompare(b.title)
  )
}

export function useLocalMovies() {
  const [allMovies, setAllMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/movies.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return res.json() as Promise<LocalMovieFromJSON[]>
      })
      .then((data) => {
        setAllMovies(groupLibrary(data.map((movie) => enrich(movie))))
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return { allMovies, loading, error }
}