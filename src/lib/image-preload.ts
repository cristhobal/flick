// Warm up every image reachable from the catalog: artwork in all sizes used by
// the UI, cast and actor profiles, filmography posters, and screenshots. TMDB
// metadata needed to discover those images is fetched before the warm-up.
import { backdropUrl, posterUrl, stillUrl, tmdbMediaType, type Movie } from "@/lib/data"
import {
  fetchCredits,
  fetchImages,
  fetchPersonCombinedCredits,
  fetchPersonDetails,
  IMG_URL,
} from "@/lib/tmdb"
import type { Lang } from "@/i18n/translations"

const POSTER_SIZES = ["w185", "w342", "w500"] as const
const BACKDROP_SIZES = ["w780", "w1280", "original"] as const
const STILL_SIZES = ["w300"] as const
const CONCURRENCY = 8

async function forEachWithConcurrency<T>(
  items: T[],
  limit: number,
  signal: AbortSignal | undefined,
  visit: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const item = items[next++]
      await visit(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function collectCatalogImageUrls(
  movies: Iterable<Movie | null | undefined>,
  lang: Lang,
  signal?: AbortSignal
): Promise<string[]> {
  const urls = new Set<string>()
  const titles = new Map<string, Movie>()
  const add = (url: string | null) => {
    if (url) urls.add(url)
  }
  const visit = (movie: Movie | null | undefined, seen: Set<Movie>) => {
    if (!movie || seen.has(movie)) return
    seen.add(movie)
    for (const size of POSTER_SIZES) add(posterUrl(movie.posterPath, size))
    for (const size of BACKDROP_SIZES) add(backdropUrl(movie.backdropPath, size))
    for (const size of STILL_SIZES) add(stillUrl(movie.stillPath ?? null, size))
    if (movie.tmdbId > 0) titles.set(`${tmdbMediaType(movie)}-${movie.tmdbId}`, movie)
    movie.seriesEpisodes?.forEach((episode) => visit(episode, seen))
    movie.seasonList?.forEach((season) => season.episodes.forEach((episode) => visit(episode, seen)))
  }
  const seen = new Set<Movie>()
  for (const movie of movies) visit(movie, seen)

  const actorIds = new Set<number>()
  await forEachWithConcurrency([...titles.values()], CONCURRENCY, signal, async (movie) => {
    const type = tmdbMediaType(movie)
    const [cast, screenshots] = await Promise.all([
      fetchCredits(movie.tmdbId, type, lang),
      fetchImages(movie.tmdbId, type),
    ])
    if (signal?.aborted) return
    for (const actor of cast) {
      actorIds.add(actor.id)
      add(actor.profile_path ? `${IMG_URL}/w185${actor.profile_path}` : null)
    }
    for (const path of screenshots) {
      add(`${IMG_URL}/w1280${path}`)
      add(`${IMG_URL}/original${path}`)
    }
  })

  await forEachWithConcurrency([...actorIds], CONCURRENCY, signal, async (actorId) => {
    const [person, credits] = await Promise.all([
      fetchPersonDetails(actorId, lang),
      fetchPersonCombinedCredits(actorId, lang),
    ])
    if (signal?.aborted) return
    add(person?.profile_path ? `${IMG_URL}/w342${person.profile_path}` : null)
    for (const credit of credits) add(posterUrl(credit.posterPath, "w342"))
  })

  return [...urls]
}

// Loads one image fully (fetched and decoded). A broken URL counts as done — the
// component falls back the same way it would without the warm-up.
function loadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = "async"
    img.onload = () => {
      img.decode().catch(() => {}).finally(() => resolve())
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

// Loads every URL, CONCURRENCY at a time, reporting progress as each settles.
// Resolves once all have loaded or failed; `signal` stops it early.
export async function preloadImages(
  urls: string[],
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  let next = 0
  let loaded = 0
  onProgress?.(0, urls.length)
  const worker = async () => {
    while (next < urls.length && !signal?.aborted) {
      const url = urls[next++]
      await loadImage(url)
      loaded++
      if (!signal?.aborted) onProgress?.(loaded, urls.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))
}
