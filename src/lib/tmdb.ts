import { TMDB_LOCALES, translateGenre, type Lang } from "@/i18n/translations"

const ACCESS_TOKEN = import.meta.env.PUBLIC_TMDB_TOKEN as string | undefined

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
  created_by?: { id: number; name: string }[]
  production_companies?: { id: number; name: string; origin_country?: string }[]
  networks?: { id: number; name: string; origin_country?: string }[]
  seasons?: { id: number; name: string; season_number: number; episode_count: number }[]
  production_countries: { iso_3166_1: string; name: string }[]; number_of_seasons?: number
  number_of_episodes?: number; status: string; popularity: number; tagline: string; vote_count: number
}
interface Genre { id: number; name: string }
interface TMDbGenreResponse { genres: Genre[] }
const GENRE_CACHE = new Map<Lang, Genre[]>()

async function apiFetch<T>(endpoint: string, retries = 3): Promise<T> {
  const token = ACCESS_TOKEN?.trim()
  if (!token || token === "undefined" || token === "null") {
    throw new Error("TMDB token missing: PUBLIC_TMDB_TOKEN is not available in this build.")
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
    if (res.status === 429) {
      // Rate limited — wait and retry with exponential backoff
      const wait = Math.pow(2, attempt) * 500
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      const detail = res.status === 401
        ? "Check that PUBLIC_TMDB_TOKEN is a TMDB v4 Read Access Token and redeploy."
        : res.statusText
      throw new Error(`TMDB error ${res.status}: ${detail}`)
    }
    return res.json()
  }
  throw new Error(`TMDB rate limit exceeded after ${retries} retries: ${endpoint}`)
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

type PagedResult = { items: TMDbMovie[]; totalPages: number }
function toPagedResult(data: TMDbPageResponse<TMDbMovie>): PagedResult {
  return { items: Array.isArray(data.results) ? data.results : [], totalPages: data.total_pages || 1 }
}

export async function fetchTrending(type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/trending/${type}/week?language=${locale(lang)}&page=${page}`)
  return toPagedResult(data)
}
export async function fetchTrendingAll(page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/trending/all/week?language=${locale(lang)}&page=${page}`)
  return toPagedResult(data)
}
export async function fetchPopular(type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/${type}/popular?language=${locale(lang)}&page=${page}`)
  return toPagedResult(data)
}
export async function fetchTopRated(type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/${type}/top_rated?language=${locale(lang)}&page=${page}`)
  return toPagedResult(data)
}
export async function discoverByGenre(genreId: number, type: "movie" | "tv" = "movie", page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/discover/${type}?language=${locale(lang)}&page=${page}&with_genres=${genreId}&sort_by=popularity.desc`)
  return toPagedResult(data)
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
  return (Array.isArray(ids) ? ids : []).map((id) => map[id]).filter(Boolean).join(", ")
}

export interface TMDbCast { id: number; name: string; character: string; profile_path: string | null; order: number }
export interface TMDbCrew { id: number; name: string; job: string; department: string; profile_path: string | null }
interface TMDbCreditsResponse { cast: TMDbCast[]; crew?: TMDbCrew[] }
export interface TMDbCreativeCredits {
  cast: TMDbCast[]
  crew: TMDbCrew[]
  detail: TMDbMovieDetail | null
  trailerUrl: string | null
}
export async function fetchCredits(id: number, type: "movie" | "tv" = "movie", lang: Lang = "en") {
  try {
    const data = await apiFetch<TMDbCreditsResponse>(`/${type}/${id}/credits?language=${locale(lang)}`)
    return (data.cast || []).slice(0, 12)
  } catch {
    return []
  }
}

export async function fetchCreativeCredits(id: number, type: "movie" | "tv" = "movie", lang: Lang = "en"): Promise<TMDbCreativeCredits> {
  try {
    const [credits, detail] = await Promise.all([
      apiFetch<TMDbCreditsResponse>(`/${type}/${id}/credits?language=${locale(lang)}`),
      fetchDetailWithVideos(id, type, lang).catch(() => null),
    ])
    return {
      cast: (credits.cast || []).slice(0, 12),
      crew: credits.crew || [],
      detail: detail?.detail || null,
      trailerUrl: detail?.trailerUrl || null,
    }
  } catch {
    return { cast: [], crew: [], detail: null, trailerUrl: null }
  }
}

export interface TMDbEpisode {
  id: number
  name: string
  overview: string
  episode_number: number
  season_number: number
  runtime?: number | null
  still_path: string | null
  vote_average?: number
  air_date?: string
}

interface TMDbSeasonResponse {
  id: number
  name: string
  season_number: number
  episodes?: TMDbEpisode[]
}

export async function fetchTvSeasonEpisodes(id: number, seasonNumber: number, lang: Lang = "en"): Promise<TMDbEpisode[]> {
  try {
    const data = await apiFetch<TMDbSeasonResponse>(`/tv/${id}/season/${seasonNumber}?language=${locale(lang)}`)
    return Array.isArray(data.episodes) ? data.episodes : []
  } catch {
    return []
  }
}

interface TMDbEpisodeGroupSummary {
  id: string
  name: string
  type: number
  group_count: number
  episode_count: number
}

interface TMDbEpisodeGroupsResponse {
  results?: TMDbEpisodeGroupSummary[]
}

interface TMDbEpisodeGroupDetail {
  id: string
  name: string
  type: number
  group_count: number
  episode_count: number
  groups?: {
    id: string
    name: string
    order: number
    episodes?: TMDbEpisode[]
  }[]
}

export interface TMDbEpisodeGroupSeason {
  season: number
  title: string
  episodes: TMDbEpisode[]
}

export async function fetchTvEpisodeGroupSeasons(
  id: number,
  expectedEpisodes = 0,
  currentSeasonCount = 0,
  lang: Lang = "en",
  localizedSeasonNames: Record<number, string> = {}
): Promise<TMDbEpisodeGroupSeason[]> {
  try {
    const list = await apiFetch<TMDbEpisodeGroupsResponse>(`/tv/${id}/episode_groups`)
    const summaries = (list.results || [])
      .filter((group) => group.group_count > Math.max(1, currentSeasonCount))
      .sort((a, b) => {
        const typePriority = (type: number) => {
          if (type === 7) return 0 // TV
          if (type === 6) return 1 // Production
          if (type === 5) return 2 // Story arc
          if (type === 3) return 3 // DVD
          return 4
        }
        const episodeDeltaA = expectedEpisodes ? Math.abs(a.episode_count - expectedEpisodes) : 0
        const episodeDeltaB = expectedEpisodes ? Math.abs(b.episode_count - expectedEpisodes) : 0
        return episodeDeltaA - episodeDeltaB
          || typePriority(a.type) - typePriority(b.type)
          || b.group_count - a.group_count
      })

    for (const summary of summaries.slice(0, 5)) {
      try {
        const detail = await apiFetch<TMDbEpisodeGroupDetail>(`/tv/episode_group/${summary.id}?language=${locale(lang)}`)
        const seasons = (detail.groups || [])
          .filter((group) => (group.episodes || []).length > 0)
          .sort((a, b) => a.order - b.order)
          .map((group, index) => {
            const seasonNumber = index + 1
            return {
              season: seasonNumber,
              title: localizedSeasonNames[seasonNumber] || group.name || `Season ${seasonNumber}`,
              episodes: group.episodes || [],
            }
          })
        if (seasons.length > Math.max(1, currentSeasonCount)) return seasons
      } catch {
        // Try the next episode group when one group detail is unavailable.
      }
    }
  } catch {
    return []
  }

  return []
}

export async function fetchAnime(page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/discover/tv?language=${locale(lang)}&page=${page}&with_keywords=210024&sort_by=popularity.desc`)
  return toPagedResult(data)
}

export async function fetchAnimeByGenre(page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/discover/tv?language=${locale(lang)}&page=${page}&with_genres=16&with_origin_country=JP&sort_by=popularity.desc`)
  return toPagedResult(data)
}

export async function fetchAnimeTopRated(page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/discover/tv?language=${locale(lang)}&page=${page}&with_keywords=210024&sort_by=vote_average.desc&vote_count.gte=100`)
  return toPagedResult(data)
}

export async function fetchTvTopRated(page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/tv/top_rated?language=${locale(lang)}&page=${page}`)
  return toPagedResult(data)
}

export async function fetchTvTrending(page = 1, lang: Lang = "en"): Promise<PagedResult> {
  const data = await apiFetch<TMDbPageResponse<TMDbMovie>>(`/trending/tv/week?language=${locale(lang)}&page=${page}`)
  return toPagedResult(data)
}
