// Tracks how far the user got into each local-video playthrough — a standalone
// movie, or one specific episode of a series/anime — so "Continue Watching" on
// the home page can resume playback from exactly where they left off. Local
// dev only: this is only ever called from LocalVideoPlayer, which only renders
// for real local file playback (never the TMDB trailer iframe path).
const STORAGE_KEY = "flick-watch-progress"
// Fired on this tab whenever progress is written or cleared, so views showing a
// "Reproducir"/"Reanudar" label (detail page, hero, cards…) can refresh without
// a full reload. `storage` events only fire in *other* tabs, hence this.
export const WATCH_PROGRESS_EVENT = "flick:watch-progress"

function notifyChange() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(WATCH_PROGRESS_EVENT))
}
// Ignore the first few seconds so opening something and immediately backing
// out doesn't leave a "continue watching" entry for it.
const MIN_PROGRESS_SECONDS = 15
// Once this close to the end (or within a flat tail margin, for short
// episodes), treat it as finished — drop it instead of remembering a resume
// point nobody would use.
const NEAR_END_RATIO = 0.95
const NEAR_END_MARGIN_SECONDS = 20

export interface WatchProgressEntry {
  id: string
  seriesId?: string
  currentTime: number
  duration: number
  updatedAt: number
}

type ProgressMap = Record<string, WatchProgressEntry>

function readAll(): ProgressMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(map: ProgressMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage disabled/full — progress just won't persist this time.
  }
}

function isNearEnd(currentTime: number, duration: number): boolean {
  if (duration <= 0) return false
  const remaining = duration - currentTime
  return remaining <= NEAR_END_MARGIN_SECONDS || currentTime / duration >= NEAR_END_RATIO
}

// `seriesId` should be the parent show's own id for an episode, and left
// unset for a standalone movie — it's what lets listWatchProgress collapse
// every episode of one series down to a single "continue watching" card.
export function saveWatchProgress(id: string, currentTime: number, duration: number, seriesId?: string) {
  if (!id || duration <= 0 || currentTime < MIN_PROGRESS_SECONDS) return
  const map = readAll()
  if (isNearEnd(currentTime, duration)) {
    if (!(id in map)) return
    delete map[id]
  } else {
    map[id] = { id, seriesId, currentTime, duration, updatedAt: Date.now() }
  }
  writeAll(map)
  notifyChange()
}

export function clearWatchProgress(id: string) {
  const map = readAll()
  if (!(id in map)) return
  delete map[id]
  writeAll(map)
  notifyChange()
}

export function getWatchProgress(id: string): WatchProgressEntry | null {
  return readAll()[id] || null
}

// The resume state of a title as a browse/detail view sees it: a movie (or a
// specific episode) by its own id, a series by whether *any* of its episodes is
// mid-watch. `unstarted` also covers "finished" — a completed playthrough is
// deleted, not kept, so the two are indistinguishable from here.
export interface WatchState {
  inProgress: boolean
  entry: WatchProgressEntry | null
  /** 0–1, or 0 when not started. */
  ratio: number
}

export function getWatchState(id: string): WatchState {
  const map = readAll()
  const entry =
    map[id] || Object.values(map).find((candidate) => candidate.seriesId === id) || null
  if (!entry || entry.duration <= 0) return { inProgress: false, entry: null, ratio: 0 }
  return {
    inProgress: true,
    entry,
    ratio: Math.min(1, Math.max(0, entry.currentTime / entry.duration)),
  }
}

// One entry per series (its most-recently-watched episode wins) plus every
// standalone movie in progress, newest first.
export function listWatchProgress(): WatchProgressEntry[] {
  const map = readAll()
  const bySeries = new Map<string, WatchProgressEntry>()
  const standalone: WatchProgressEntry[] = []
  for (const entry of Object.values(map)) {
    if (entry.seriesId) {
      const existing = bySeries.get(entry.seriesId)
      if (!existing || existing.updatedAt < entry.updatedAt) bySeries.set(entry.seriesId, entry)
    } else {
      standalone.push(entry)
    }
  }
  return [...standalone, ...bySeries.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}
