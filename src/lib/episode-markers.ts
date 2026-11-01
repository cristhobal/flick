// Opening / ending markers per series, season and episode, read from
// src/config/episode-markers.json (see that file's "$comment" and the JSON schema
// next to it for the format). The player only asks `resolveEpisodeMarkers` for an
// episode's intervals; adding a series, season or episode is a config edit, never a
// player change. Vite hot-reloads the JSON, so an edit applies without a page reload.
//
// Lookup, per field (each one independently): episode → season → series. The first
// level that mentions a field wins; `null` there switches it off for that scope
// (e.g. an episode without opening inside a season that has one).
import config from "@/config/episode-markers.json"

export interface MarkerInterval {
  start: number
  end: number
}

export interface EpisodeMarkers {
  opening: MarkerInterval | null
  ending: MarkerInterval | null
  // Next-episode card behaviour. `undefined` = the config doesn't say; the player
  // then applies its defaults.
  // There is more of the episode after the ending (post-credits scene, preview…).
  postCredits?: boolean
  // Where that scene is, when the config says so. The ending then gets a "skip
  // ending" button that jumps to its start, and the next-episode card waits for its
  // end instead of covering it. Without it (`postCredits: true` alone) the card
  // shows over the ending, but never counts down or advances by itself.
  postCreditsScene?: MarkerInterval
  // Count down and then play the next episode (only when there's no post-credits).
  autoplay?: boolean
  // Length of that countdown, in seconds.
  countdown?: number
  // When the card appears; defaults to the start of the ending.
  nextCardAt?: number
}

type RawTime = string | number
type RawInterval = { start: RawTime; end?: RawTime } | null
interface RawMarkers {
  opening?: RawInterval
  ending?: RawInterval
  postCredits?: boolean | RawInterval
  autoplay?: boolean
  countdown?: RawTime
  nextCardAt?: RawTime | null
}
interface RawSeason extends RawMarkers {
  episodes?: Record<string, RawMarkers>
}
interface RawSeries extends RawMarkers {
  title: string
  aliases?: string[]
  tmdbId?: number
  seasons?: Record<string, RawSeason>
}
interface RawConfig {
  series?: RawSeries[]
}

export interface EpisodeIdentity {
  // Every name the show is known by here: its folder on disk, the TMDB title,
  // the original title… Matched case/accent/punctuation-insensitively.
  titles: string[]
  tmdbId?: number
  season: number
  episode: number
}

// "1:30", "01:30", "1:02:03", "90", "83.5", 83.5 → seconds. A leading "-" counts
// back from the end of the file ("-1:30" = 90 s before the end), handy for a
// season-wide ending when episodes differ in length.
export function parseMarkerTime(raw: RawTime, duration: number): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? (raw < 0 ? duration + raw : raw) : null
  const text = raw.trim()
  const fromEnd = text.startsWith("-")
  const parts = (fromEnd ? text.slice(1) : text).split(":")
  if (parts.length === 0 || parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part.trim()))) return null
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0)
  if (!fromEnd) return seconds
  return duration > 0 ? duration - seconds : null
}

function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(\s*\d{4}\s*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function findSeries(identity: EpisodeIdentity): RawSeries | null {
  const series = (config as RawConfig).series || []
  if (identity.tmdbId && identity.tmdbId > 0) {
    const byId = series.find((entry) => entry.tmdbId === identity.tmdbId)
    if (byId) return byId
  }
  const wanted = new Set(identity.titles.filter(Boolean).map(normalizeTitle))
  return (
    series.find((entry) =>
      [entry.title, ...(entry.aliases || [])].some((name) => wanted.has(normalizeTitle(name)))
    ) || null
  )
}

function pick<K extends keyof RawMarkers>(levels: Array<RawMarkers | undefined>, key: K): RawMarkers[K] | undefined {
  for (const level of levels) {
    if (level && key in level) return level[key]
  }
  return undefined
}

function toInterval(raw: RawInterval | undefined, duration: number, label: string): MarkerInterval | null {
  if (!raw) return null
  const start = parseMarkerTime(raw.start, duration)
  // No `end`: the interval runs to the end of the file.
  const end = raw.end === undefined ? (duration > 0 ? duration : null) : parseMarkerTime(raw.end, duration)
  if (start === null || end === null || !(end > start) || start < 0) {
    if (import.meta.env.DEV) console.warn(`[episode-markers] ${label}: invalid interval`, raw)
    return null
  }
  return { start, end: duration > 0 ? Math.min(end, duration) : end }
}

export function resolveEpisodeMarkers(identity: EpisodeIdentity, duration: number): EpisodeMarkers {
  const series = findSeries(identity)
  if (!series) return { opening: null, ending: null }
  const season = series.seasons?.[String(identity.season)]
  const episode = season?.episodes?.[String(identity.episode)]
  const levels = [episode, season, series]
  const label = `${series.title} T${identity.season}E${identity.episode}`
  const warn = (field: string, value: unknown) => {
    if (import.meta.env.DEV) console.warn(`[episode-markers] ${label}: invalid ${field}`, value)
  }

  // true/false, or the scene itself as an interval (which implies true).
  const rawPostCredits = pick(levels, "postCredits")
  const postCreditsScene = rawPostCredits && typeof rawPostCredits === "object"
    ? toInterval(rawPostCredits, duration, `${label} postCredits`)
    : null
  const postCredits = postCreditsScene ? true : rawPostCredits
  const autoplay = pick(levels, "autoplay")
  const rawCountdown = pick(levels, "countdown")
  const rawNextCardAt = pick(levels, "nextCardAt")
  // A duration, not a position: never counted from the end of the file.
  const countdown = rawCountdown === undefined ? undefined : parseMarkerTime(rawCountdown, 0)
  const nextCardAt = rawNextCardAt == null ? undefined : parseMarkerTime(rawNextCardAt, duration)
  if (rawCountdown !== undefined && !(countdown !== null && countdown! > 0)) warn("countdown", rawCountdown)
  if (rawNextCardAt != null && nextCardAt === null) warn("nextCardAt", rawNextCardAt)

  return {
    opening: toInterval(pick(levels, "opening"), duration, `${label} opening`),
    ending: toInterval(pick(levels, "ending"), duration, `${label} ending`),
    postCredits: typeof postCredits === "boolean" ? postCredits : undefined,
    postCreditsScene: postCreditsScene ?? undefined,
    autoplay: typeof autoplay === "boolean" ? autoplay : undefined,
    countdown: countdown != null && countdown > 0 ? countdown : undefined,
    nextCardAt: nextCardAt != null && nextCardAt >= 0 ? nextCardAt : undefined,
  }
}
