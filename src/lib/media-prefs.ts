// Remembers the audio track + subtitle the viewer picked for a title, so reopening it
// (or the next episode of a series) starts the way they left it. Local dev only —
// same scope as watch-progress.
//
// Where a choice is stored (three layers, newest write wins):
//   1. Memory      — instant reads while the player is open.
//   2. Server      — /api/local-prefs, a JSON file next to the project. This is the
//                    source of truth: it survives another port/browser and cleared
//                    site data, none of which localStorage does.
//   3. localStorage — offline/cache fallback, and how choices made before the server
//                    store existed are still found.
//
// What a choice is attached to: the FILE (`file:<relative path>`). It is the only
// identity that never changes; ids derived from TMDB matching do (a different search
// result, language, or being offline gives a different id — and the choice "vanished").
// Episodes additionally save a `show:<folder>` entry that every episode without its
// own choice starts from.
//
// How a saved choice finds its track again: not by language alone. Blu-ray/TS rips
// very often carry NO language tag, and the old language-only matching then saved
// `null` — reopening lost the audio track and, worse, read "subtitle chosen but
// untagged" as "subtitles off". Now a track is remembered by everything that
// identifies it (language, title, codec, position) and matched from the strongest
// signal down, and "off" is its own explicit value.
const STORAGE_KEY = "flick-media-prefs"
const API_PATH = "/api/local-prefs"
const PREFS_VERSION = 2

export interface MediaTrackPrefs {
  version?: number
  updatedAt?: number
  audioLanguage: string | null
  audioTitle: string | null
  audioIndex: number | null
  audioCodec?: string | null
  // null subtitleIndex/subtitleLanguage together with subtitleOff = the viewer
  // explicitly turned subtitles off (which is also what reopening should do).
  subtitleOff?: boolean
  subtitleLanguage: string | null
  subtitleTitle: string | null
  subtitleForced: boolean
  subtitleIndex: number | null
  subtitleCodec?: string | null
}

interface TrackLike {
  index: number
  language: string
  title: string
  codec?: string
  forced?: boolean
  default?: boolean
}

type PrefsMap = Record<string, MediaTrackPrefs>

// ---- keys ----

export function fileKey(relPath: string): string {
  return `file:${relPath}`
}

// The viewer's last explicit choice, anywhere. Read LAST (after file and show), so a
// title or show with its own choice keeps it, while one never configured starts the
// way the viewer last left things: same audio language when the file has it, and
// subtitles only if they last turned them on. Never written by automatic picks.
export const GLOBAL_PREFS_KEY = "global"

// "Series/Show/Temporada 2/E01.mkv" -> "Series/Show". Episodes of one show share it.
export function showKey(relPath: string): string {
  const parts = relPath.split(/[\\/]/).slice(0, -1)
  if (parts.length > 1 && /^(temporada|season)\s*\d+/i.test(parts[parts.length - 1])) parts.pop()
  return `show:${parts.join("/")}`
}

// ---- storage ----

let memory: PrefsMap = {}
let loadPromise: Promise<void> | null = null

function readLocal(): PrefsMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocal(map: PrefsMap) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage disabled/full — the server copy still has it.
  }
}

function newest(a: MediaTrackPrefs | undefined, b: MediaTrackPrefs | undefined): MediaTrackPrefs | undefined {
  if (!a) return b
  if (!b) return a
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a
}

/** Loads the server store (once) and merges it with localStorage. Safe to call repeatedly. */
export function loadMediaPrefs(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const local = readLocal()
    let remote: PrefsMap = {}
    try {
      const res = await fetch(API_PATH)
      if (res.ok) remote = ((await res.json()) as { prefs?: PrefsMap }).prefs || {}
    } catch {
      // Server unreachable — fall back to what the browser has.
    }
    const merged: PrefsMap = { ...local }
    const backfill: PrefsMap = {}
    for (const [key, value] of Object.entries(remote)) merged[key] = newest(merged[key], value) as MediaTrackPrefs
    // Anything only the browser knows about (choices from before the server store
    // existed) is pushed up so it stops depending on this one origin.
    for (const [key, value] of Object.entries(local)) {
      if (merged[key] === value && remote[key] !== value) backfill[key] = value
    }
    memory = merged
    if (Object.keys(backfill).length > 0) pushToServer(backfill)
  })()
  return loadPromise
}

function pushToServer(entries: PrefsMap) {
  try {
    void fetch(API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
      // Survives the tab closing right after the choice was made.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Ignore — localStorage still has it.
  }
}

/** Reads the best saved choice among `keys` (most specific first). Call after loadMediaPrefs(). */
export function getMediaPrefs(keys: Array<string | null | undefined>): MediaTrackPrefs | null {
  for (const key of keys) {
    if (key && memory[key]) return memory[key]
  }
  return null
}

/** Saves `prefs` under every key given (file, and show for episodes). */
export function saveMediaPrefs(keys: Array<string | null | undefined>, prefs: MediaTrackPrefs) {
  const stamped: MediaTrackPrefs = { ...prefs, version: PREFS_VERSION, updatedAt: Date.now() }
  const entries: PrefsMap = {}
  for (const key of keys) {
    if (key) entries[key] = stamped
  }
  if (Object.keys(entries).length === 0) return
  memory = { ...memory, ...entries }
  writeLocal({ ...readLocal(), ...entries })
  pushToServer(entries)
}

// ---- matching a saved choice back to a track ----

// Best track in `tracks` for what was saved. Signals, strongest first:
//   1. same language (when one was saved; an untagged choice only matches untagged tracks)
//   2. among those: the same position, if it still holds the same codec
//   3. the same title, then the same forced flag
//   4. the first candidate
function pickTrack(
  tracks: TrackLike[],
  saved: { language: string | null; title: string | null; index: number | null; codec?: string | null; forced?: boolean }
): TrackLike | null {
  const candidates = saved.language
    ? tracks.filter((track) => track.language === saved.language)
    : tracks.filter((track) => !track.language)
  if (candidates.length === 0) return null
  const codecOk = (track: TrackLike) => !saved.codec || !track.codec || track.codec === saved.codec

  if (saved.index != null) {
    const byIndex = candidates.find((track) => track.index === saved.index && codecOk(track))
    if (byIndex) return byIndex
  }
  if (saved.title) {
    const byTitle = candidates.find((track) => track.title === saved.title)
    if (byTitle) return byTitle
  }
  if (saved.forced !== undefined) {
    const byForced = candidates.find((track) => Boolean(track.forced) === saved.forced && codecOk(track))
    if (byForced) return byForced
  }
  return candidates.find(codecOk) || candidates[0]
}

// Which audio track to start on — always a real track of THIS file. A saved choice
// wins when the file has that language; otherwise the track the file itself marks
// as default, otherwise the first one (never an index that doesn't exist here).
export function resolveAudioIndex(tracks: TrackLike[], prefs: MediaTrackPrefs | null): number {
  if (tracks.length === 0) return 0
  if (prefs && (prefs.audioIndex != null || prefs.audioLanguage)) {
    const match = pickTrack(tracks, {
      language: prefs.audioLanguage,
      title: prefs.audioTitle,
      index: prefs.audioIndex,
      codec: prefs.audioCodec,
    })
    if (match) return match.index
  }
  return (tracks.find((track) => track.default) || tracks[0]).index
}

// Which subtitle track to start on, or null for none. No saved choice, an explicit
// "off", or a choice this file can't satisfy (its language isn't here) → no subtitle.
export function resolveSubtitleIndex(tracks: TrackLike[], prefs: MediaTrackPrefs | null): number | null {
  if (!prefs || prefs.subtitleOff) return null
  if (prefs.subtitleIndex == null && !prefs.subtitleLanguage) return null
  const match = pickTrack(tracks, {
    language: prefs.subtitleLanguage,
    title: prefs.subtitleTitle,
    index: prefs.subtitleIndex,
    codec: prefs.subtitleCodec,
    forced: prefs.subtitleForced,
  })
  return match ? match.index : null
}
