// Remembers the audio language + subtitle the viewer picked for a given title
// (a movie by its id, a whole series/anime by its series id) so every episode
// opens with the same choice. Local dev only — same scope as watch-progress.
//
// Stored by *language* (plus title / forced / index hints to disambiguate).
// Language is the portable key across a series' episode files; the exact track
// index is kept too and wins when it still points at a track of the same
// language (the common "same movie, watched again" case, and consistently-muxed
// rips). When the saved language isn't present at all, resolution falls back to
// the first audio track and to no subtitle — per the product rule.
const STORAGE_KEY = "flick-media-prefs"

export interface MediaTrackPrefs {
  audioLanguage: string | null
  audioTitle: string | null
  audioIndex: number | null
  // null = subtitles off (also the value when nothing was ever chosen).
  subtitleLanguage: string | null
  subtitleTitle: string | null
  subtitleForced: boolean
  subtitleIndex: number | null
}

interface TrackLike {
  index: number
  language: string
  title: string
  forced?: boolean
}

type PrefsMap = Record<string, MediaTrackPrefs>

function readAll(): PrefsMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getMediaPrefs(key: string | null | undefined): MediaTrackPrefs | null {
  if (!key) return null
  return readAll()[key] || null
}

export function saveMediaPrefs(key: string | null | undefined, prefs: MediaTrackPrefs) {
  if (!key || typeof window === "undefined") return
  try {
    const map = readAll()
    map[key] = prefs
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage disabled/full — the choice just won't carry to the next episode.
  }
}

// Pick the best track in `tracks` matching the saved language, using the exact
// index / title / forced hints in order, then the first same-language track.
function bestMatch(
  sameLang: TrackLike[],
  savedIndex: number | null | undefined,
  savedTitle: string | null | undefined,
  savedForced: boolean | undefined
): TrackLike {
  const byIndex = savedIndex != null ? sameLang.find((t) => t.index === savedIndex) : undefined
  if (byIndex) return byIndex
  const byTitle = savedTitle ? sameLang.find((t) => t.title === savedTitle) : undefined
  if (byTitle) return byTitle
  if (savedForced !== undefined) {
    const byForced = sameLang.find((t) => Boolean(t.forced) === savedForced)
    if (byForced) return byForced
  }
  return sameLang[0]
}

// Which audio track to start on. Saved language wins; otherwise always the first
// track (never leaves playback silent / on an unexpected dub).
export function resolveAudioIndex(tracks: TrackLike[], prefs: MediaTrackPrefs | null): number {
  if (tracks.length === 0) return 0
  const wanted = prefs?.audioLanguage
  if (wanted) {
    const sameLang = tracks.filter((track) => track.language === wanted)
    if (sameLang.length > 0) {
      return bestMatch(sameLang, prefs?.audioIndex, prefs?.audioTitle, undefined).index
    }
  }
  return tracks[0].index
}

// Which subtitle track to start on, or null for none. A saved language that this
// file doesn't carry → null (no subtitle).
export function resolveSubtitleIndex(
  tracks: TrackLike[],
  prefs: MediaTrackPrefs | null
): number | null {
  const wanted = prefs?.subtitleLanguage
  if (!wanted) return null
  const sameLang = tracks.filter((track) => track.language === wanted)
  if (sameLang.length === 0) return null
  return bestMatch(sameLang, prefs?.subtitleIndex, prefs?.subtitleTitle, Boolean(prefs?.subtitleForced)).index
}
