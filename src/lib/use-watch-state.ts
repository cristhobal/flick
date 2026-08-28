import { useCallback, useSyncExternalStore } from "react"
import { getWatchState, WATCH_PROGRESS_EVENT, type WatchState } from "@/lib/watch-progress"

const IDLE: WatchState = { inProgress: false, entry: null, ratio: 0 }

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(WATCH_PROGRESS_EVENT, onChange)
  window.addEventListener("storage", onChange)
  window.addEventListener("focus", onChange)
  return () => {
    window.removeEventListener(WATCH_PROGRESS_EVENT, onChange)
    window.removeEventListener("storage", onChange)
    window.removeEventListener("focus", onChange)
  }
}

// useSyncExternalStore needs getSnapshot to return a stable reference while the
// underlying value is unchanged, so cache the last result per id and only build
// a fresh object when the meaningful fields actually move.
const cache = new Map<string, WatchState>()

function snapshot(id: string): WatchState {
  const next = getWatchState(id)
  const prev = cache.get(id)
  if (
    prev &&
    prev.inProgress === next.inProgress &&
    prev.entry?.currentTime === next.entry?.currentTime &&
    prev.entry?.updatedAt === next.entry?.updatedAt
  ) {
    return prev
  }
  cache.set(id, next)
  return next
}

// Live "Reproducir vs Reanudar" state for a title. Re-reads whenever this tab
// writes progress (WATCH_PROGRESS_EVENT), another tab does (`storage`), or the
// window regains focus — so a card/button label is never stale after playback.
export function useWatchState(id: string | null | undefined): WatchState {
  const getSnapshot = useCallback(() => (id ? snapshot(id) : IDLE), [id])
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE)
}
