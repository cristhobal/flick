import { TMDB_LOCALES, translateGenre, type Lang } from "@/i18n/translations"

const TEST_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzN2VjNjdjYjkwMmIyNDc0ODk3YmQ4ZGZmZTkxNTEwNCIsIm5iZiI6MTY5ODk0NDAxOC41Nzc5OTk4LCJzdWIiOiI2NTQzZDQxMjI4NjZmYTAwZTFlZDg3M2EiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.DUnt-Wh6czMw1Bf9b4sOtn-XfpxzwPoGTHeQiAarG70"
const ACCESS_TOKEN = (import.meta.env.PUBLIC_TMDB_TOKEN as string | undefined) || TEST_ACCESS_TOKEN

const BASE_URL = "https://api.themoviedb.org/3"
export const IMG_URL = "https://image.tmdb.org/t/p"

interface TMDbPageResponse<T> { page: number; results: T[]; total_pages: number; total_results: number }
export interface TMDbMovie {
  id: number; title?: string; name?: string; poster_path: string | null; backdrop_path: string | null
  overview?: string; vote_average?: number; release_date?: string; first_air_date?: string; genre_ids?: number[]
  media_type?: string; original_language: string; popularity: number
}
export interface TMDbMovieDetail {
  id: number; title?: string; name?: string; poster_path: string | null; backdrop_path: string | null
  overview: string; vote_average: number; release_date?: string; first_air_date?: string; runtime?: number | null
  episode_run_time?: number[]; last_episode_to_air?: { runtime?: number | null } | null
  genres?: { id: number; name: string }[]; spoken_languages?: { iso_639_1: string; english_name: string }[]
  production_countries: { iso_3166_1: string; name: string }[]; number_of_seasons?: number
  number_of_episodes?: number; status: string; popularity: number; tagline: string; vote_count: number
}
interface Genre { id: number; name: string }
interface TMDbGenreResponse { genres: Genre[] }
const GENRE_CACHE = new Map<Lang, Genre[]>()

async function apiFetch<T>(endpoint: string): Promise<T> {
  const token = ACCESS_TOKEN?.trim()
  if (!token || token === "undefined" || token === "null") {
    throw new Error("TMDB token missing: PUBLIC_TMDB_TOKEN is not available in this build.")
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const detail = res.status === 401
      ? "Check that PUBLIC_TMDB_TOKEN is a TMDB v4 Read Access Token and redeploy."
      : res.statusText
    throw new Error(`TMDB error ${res.status}: ${detail}`)
  }
  return res.json()
}

function locale(lang: Lang) { return TMDB_LOCALES[lang] }
function videoLanguages(lang: Lang) {
  const primary = locale(lang).split("-")[0]
  return encodeURIComponent([...new Set([primary, "en", "null"])].join(","))
}
function normalizeGenreName(name: string, lang: Lang) {
  return translateGenre(name, lang)
}
function normalizeGenreList(genres: Genre[], lang: Lang): Genre[] {
  return genres.map((genre) => ({
    ...genre,
    name: normalizeGenreName(genre.name, lang),
  }))
}

export async function fetchGenres(lang: Lang = "en"): Promise<Genre[]> {
  const cached = GENRE_CACHE.get(lang)
  if (cached) return cached
  const language = locale(lang)
  const [movieRes, tvRes] = await Promise.all([
    apiFetch<TMDbGenreResponse>(`/genre/movie/list?language=${language}`),
    apiFetch<TMDbGenreResponse>(`/genre/tv/list?language=${language}`),
  ])
  const movieGenres = normalizeGenreList(movieRes.genres || [], lang)
  const tvGenres = normalizeGenreList(tvRes.genres || [], lang)
  const merged = [...movieGenres, ...tvGenres.filter((g) => !movieGenres.some((m) => m.id === g.id))]
  GENRE_CACHE.set(lang, merged)
  return merged
}

export async function fetchTrending(type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en") {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/trending/${type}/week?language=${locale(lang)}&page=${page}`)
  return Array.isArray(data.results) ? data.results : []
}
export async function fetchTrendingAll(page = 1, lang: Lang = "en") {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/trending/all/week?language=${locale(lang)}&page=${page}`)
  return Array.isArray(data.results) ? data.results : []
}
export async function fetchPopular(type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en") {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/${type}/popular?language=${locale(lang)}&page=${page}`)
  return Array.isArray(data.results) ? data.results : []
}
export async function fetchTopRated(type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en") {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/${type}/top_rated?language=${locale(lang)}&page=${page}`)
  return Array.isArray(data.results) ? data.results : []
}
export async function discoverByGenre(genreId: number, type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en") {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/discover/${type}?language=${locale(lang)}&page=${page}&with_genres=${genreId}&sort_by=popularity.desc`)
  return Array.isArray(data.results) ? data.results : []
}
export async function searchMulti(query: string, page = 1, lang: Lang = "en") {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/search/multi?query=${encodeURIComponent(query)}&language=${locale(lang)}&page=${page}`)
  return Array.isArray(data.results) ? data.results : []
}
export async function fetchDetail(id: number, type: "movie" | "tv" = "movie", lang: Lang = "en") {
  return apiFetch<TMDbMovieDetail>(`/${type}/${id}?language=${locale(lang)}`)
}

export interface TMDbVideo { key: string; site: string; type: string; official: boolean }
interface TMDbVideosResponse { results?: TMDbVideo[] }
export async function fetchDetailWithVideos(id: number, type: "movie" | "tv" = "movie", lang: Lang = "en") {
  const [detail, videos] = await Promise.all([
    fetchDetail(id, type, lang),
    apiFetch<TMDbVideosResponse>(`/${type}/${id}/videos?language=${locale(lang)}&include_video_language=${videoLanguages(lang)}`),
  ])
  const videoResults = Array.isArray(videos.results) ? videos.results : []
  const trailer = videoResults.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official)
    || videoResults.find((v) => v.site === "YouTube" && v.type === "Trailer")
  return {
    detail,
    trailerUrl: trailer ? `https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=0&controls=1` : null,
  }
}

export async function mapGenres(ids: number[] = [], lang: Lang = "en") {
  const genres = await fetchGenres(lang)
  const map: Record<number, string> = {}
  for (const genre of genres) map[genre.id] = normalizeGenreName(genre.name, lang)
  return (Array.isArray(ids) ? ids : []).map((id) => map[id]).filter(Boolean).slice(0, 2).join(", ")
}

export interface TMDbCast { id: number; name: string; character: string; profile_path: string | null; order: number }
interface TMDbCreditsResponse { cast: TMDbCast[] }
export async function fetchCredits(id: number, type: "movie" | "tv" = "movie", lang: Lang = "en") {
  try {
    const data = await apiFetch<TMDbCreditsResponse>(`/${type}/${id}/credits?language=${locale(lang)}`)
    return (data.cast || []).slice(0, 12)
  } catch {
    return []
  }
}

export async function fetchAnime(page = 1, lang: Lang = "en") {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/discover/tv?language=${locale(lang)}&page=${page}&with_keywords=210024&sort_by=popularity.desc`)
  return Array.isArray(data.results) ? data.results : []
}
