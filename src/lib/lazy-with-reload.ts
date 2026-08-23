import { lazy, type ComponentType } from "react"

// Vite's dev server invalidates already-fetched lazy chunks whenever a file they
// depend on gets hot-updated (routine while actively editing a lazily-imported
// component, or when Fast Refresh has to fully invalidate a subtree — e.g.
// I18nProvider.tsx mixes a component and a hook export, which Vite can't hot-patch
// in place). The *next* time React.lazy() re-triggers that dynamic import() — e.g.
// navigating to a different movie's detail page — the request 404s with "Failed to
// fetch dynamically imported module" until the page is hard-reloaded. Retry
// automatically so the user never has to notice or do it themselves. This also helps
// in production after a fresh deploy invalidates chunk hashes for a tab that's been
// open since before it.
//
// A one-shot "already reloaded" flag isn't enough: several lazy chunks can each fail
// during one burst of edits, and if none of them gets a chance to succeed (and clear
// the flag) before the next failure, every failure after the first would just throw
// instead of recovering. Use a short cooldown instead — every failure more than a
// couple seconds after the last auto-reload gets its own fresh attempt, while still
// guarding against a true infinite reload loop for a genuinely broken deployment.
const LAST_RELOAD_KEY = "flick:chunk-reload-at"
const RELOAD_COOLDOWN_MS = 4000

function canAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) || "0")
    return Date.now() - last > RELOAD_COOLDOWN_MS
  } catch {
    return true // storage unavailable — allow it, worst case a private-mode tab reloads once
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()))
  } catch {
    // Ignore — worst case this retries the reload once more than intended.
  }
}

function reloadIfAllowed() {
  if (!canAutoReload()) return
  markReloaded()
  window.location.reload()
}

// Vite fires this on `window` for ANY failed dynamic import it detects — including
// ones triggered by its own HMR client re-importing an updated module, which is
// outside application code and can't be caught by wrapping our own import() calls
// (see lazyWithReload below for that narrower case). This is Vite's documented,
// official hook for exactly this "stale chunk" scenario, so it's the real fix; call
// this once, as early as possible (App.tsx does, at module scope).
export function installPreloadErrorRecovery() {
  if (typeof window === "undefined") return
  window.addEventListener("vite:preloadError", () => {
    reloadIfAllowed()
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (err) {
      if (canAutoReload()) {
        reloadIfAllowed()
        return new Promise<{ default: T }>(() => {}) // reload takes over before this matters
      }
      throw err
    }
  })
}
