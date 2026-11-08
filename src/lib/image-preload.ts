// Warm up the images the home page shows on first paint (production only, see
// HomePage): the hero backdrops and the card posters of every home row, at the
// sizes those components request, so the page appears with its artwork in place.
import { backdropUrl, posterUrl, type Category, type Movie } from "@/lib/data"

const CONCURRENCY = 8

export function collectHomeImageUrls(heroes: (Movie | null | undefined)[], rows: Category[]): string[] {
  const urls = new Set<string>()
  const add = (url: string | null) => {
    if (url) urls.add(url)
  }
  for (const hero of heroes) {
    if (hero) add(backdropUrl(hero.backdropPath, "w1280")) // HeroSection
  }
  for (const row of rows) {
    for (const movie of row.items) add(posterUrl(movie.posterPath, "w342")) // MovieCard
  }
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
