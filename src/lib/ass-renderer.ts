// Thin wrapper around JASSUB (WASM libass) so subtitle tracks render with their real
// styling — fonts, colors, outlines, positioning, \tags — instead of being flattened
// to plain WebVTT text. Every text track goes through here: ASS/SSA as-is, SRT and
// friends converted to ASS server-side (see local-media-server.mjs).
//
// Timing: JASSUB draws on requestVideoFrameCallback, i.e. at the mediaTime of the
// frame actually on screen, so the line always matches the picture — including
// across seeks and in native two-element mode, where media-sync keeps that video
// locked to the <audio> the viewer hears.
//
// Why it's built the way it is — three things made subtitles slow or missing:
//
// 1. A subtitle track lives interleaved through the whole file, so the server needs a
//    full read of it (~30 s for a 1.3 GB episode on an external drive) to hand over
//    the complete track. JASSUB's `ready` waits for that download when given a
//    `subUrl`, and the previous wrapper tore the instance down after 6 s and gave up
//    after three tries — so a slow extraction meant subtitles that never showed.
//    Now the instance starts with an EMPTY track (ready as soon as the WASM and the
//    file's fonts are loaded) and track data is pushed in afterwards.
// 2. Instead of waiting for the full track, a *window* around the playhead is
//    fetched first (the server reads only that stretch: ~2 s cold) and shown at
//    once; further windows are fetched ahead of the playhead or after a seek, and
//    the full track — requested in parallel — replaces them all once it lands.
// 3. JASSUB only renders on a new video frame. A track picked while paused stayed
//    blank until playback resumed; every track change now forces a repaint at the
//    current position.
//
// One JASSUB instance lives for the whole player (switching track = `setTrack`, no
// worker restart), and every fetched track is kept in memory, so turning subtitles
// off and back on, or switching back to a language already seen, is immediate.
//
// Canvas ownership: JASSUB *transfers control of its canvas to an OffscreenCanvas*
// in its constructor, and a canvas can only be transferred once ever. So the canvas
// can NOT be a React-rendered element reused across instances. React owns a stable,
// empty container <div> (containerRef) and this hook creates a brand-new <canvas>
// inside it per instance, removing it on cleanup.
import { useEffect, useRef, useState } from "react"
import JASSUB from "jassub"
// The worker script is dist/worker/worker.js — the RPC wrapper that actually exposes
// the ASSRenderer class (via abslink/comlink) for the main thread to talk to. It's easy
// to mistake dist/wasm/jassub-worker.js for the worker entry point since it also looks
// like a "worker" script, but that file is only the Emscripten-generated WASM glue that
// worker.js imports internally — pointing workerUrl at it spins up a worker that never
// answers the RPC handshake, so `instance.ready` just hangs forever with no error.
// It's loaded through ./jassub-worker.ts, which runs worker.js after a fix for
// Android fullscreen (no low-latency canvas — see jassub-worker-no-desync.ts).
import workerUrl from "./jassub-worker?worker&url"
// eslint-disable-next-line import/no-unresolved
import wasmUrl from "jassub/dist/wasm/jassub-worker.wasm?url"
// eslint-disable-next-line import/no-unresolved
import modernWasmUrl from "jassub/dist/wasm/jassub-worker-modern.wasm?url"
// JASSUB only auto-loads its bundled fallback font when you pass NEITHER
// `availableFonts['liberation sans']` NOR `defaultFont` — and even then it
// resolves `./default.woff2` against the wrong base under Vite and 404s. So load
// it explicitly. Without a real fallback font, any subtitle whose declared font
// isn't among the file's embedded attachments (or if those fail to fetch in the
// worker) renders as *nothing* — "failed to find any fallback with glyph 0x0".
// eslint-disable-next-line import/no-unresolved
import fallbackFontUrl from "jassub/dist/default.woff2?url"

// A valid track with no events: what the instance starts with, and what it shows
// while subtitles are off.
const EMPTY_TRACK = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: 384",
  "PlayResY: 288",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Default,Arial,16,&Hffffff,&Hffffff,&H0,&H0,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "",
].join("\n")

// Window around the playhead: a little before it (a line that started just before
// still has to show) and a couple of minutes after.
const WINDOW_BEFORE_S = 15
const WINDOW_AFTER_S = 150
// Fetch the next window this long before the current one runs out.
const WINDOW_PREFETCH_S = 45
// If the worker hasn't come up by then (it occasionally never completes its
// handshake under heavy load), start a fresh one. Only WASM + fonts gate `ready`
// now — no subtitle download — so this never trips on a slow extraction.
const INIT_TIMEOUT_MS = 10000
const MAX_INIT_ATTEMPTS = 3
const WINDOW_RETRY_MS = 1500

interface TrackData {
  // The full track has arrived: `full` holds it and no more windows are needed.
  complete: boolean
  full: string
  // Partial state, from windows: the script header (styles…) and every distinct
  // event line seen so far, plus the time ranges those windows covered.
  header: string
  lines: Set<string>
  ranges: Array<[number, number]>
  windowInFlight: boolean
  fullRequested: boolean
  // Set by whichever effect run currently displays this track. Network responses
  // only update the data above and then call this, so a response that lands after
  // the effect re-ran (new instance, …) still reaches the screen.
  onFull?: () => void
  onLines?: (fresh: string[], first: boolean) => void
  kick?: () => void
}

function newTrackData(): TrackData {
  return { complete: false, full: "", header: "", lines: new Set(), ranges: [], windowInFlight: false, fullRequested: false }
}

// Splits an ASS document into its header (everything up to the first event) and its
// event lines.
function splitAss(text: string): { header: string; lines: string[] } {
  const all = text.replace(/\r\n?/g, "\n").split("\n")
  const firstEvent = all.findIndex((line) => /^(Dialogue|Comment):/.test(line))
  if (firstEvent === -1) return { header: text, lines: [] }
  return {
    header: all.slice(0, firstEvent).join("\n"),
    lines: all.slice(firstEvent).filter((line) => line.startsWith("Dialogue:")),
  }
}

function partialTrack(data: TrackData): string {
  return `${data.header}\n${[...data.lines].join("\n")}\n`
}

// Font families a piece of ASS asks for: every style's font, plus inline \fn tags.
function fontFamilies(text: string): string[] {
  const families = new Set<string>()
  for (const match of text.matchAll(/^Style:\s*[^,]*,\s*([^,]+),/gm)) families.add(match[1].trim().replace(/^@/, ""))
  for (const match of text.matchAll(/\\fn([^\\}]+)/g)) families.add(match[1].trim().replace(/^@/, ""))
  families.delete("")
  return [...families]
}

// System fonts by family, fetched once per page from the server (fontconfig, or the
// Windows fonts folder). null = the server has none by that name.
const systemFontCache = new Map<string, Promise<Uint8Array | null>>()

function fetchSystemFont(family: string): Promise<Uint8Array | null> {
  const key = family.toLowerCase()
  let pending = systemFontCache.get(key)
  if (!pending) {
    pending = fetch(`/api/subtitle-font?family=${encodeURIComponent(family)}`)
      .then(async (res) => (res.ok ? new Uint8Array(await res.arrayBuffer()) : null))
      .catch(() => null)
    systemFontCache.set(key, pending)
  }
  return pending
}

function withWindow(url: string, start: number, end: number): string {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}start=${start.toFixed(2)}&end=${end.toFixed(2)}`
}

// Families already handed to a given instance's libass.
const instanceFonts = new WeakMap<JASSUB, Set<string>>()
function loadedFontsFor(instance: JASSUB): Set<string> {
  let set = instanceFonts.get(instance)
  if (!set) {
    set = new Set()
    instanceFonts.set(instance, set)
  }
  return set
}

export function useAssSubtitle(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  containerRef: React.RefObject<HTMLElement | null>,
  subUrl: string | null,
  fontUrls: string[]
) {
  const instanceRef = useRef<JASSUB | null>(null)
  const tracksRef = useRef(new Map<string, TrackData>())
  const subUrlRef = useRef(subUrl)
  const fontsKey = fontUrls.join(",")
  // Bumped each time a (new) instance becomes ready, so the track effect re-applies
  // the selected track to it.
  const [readyGeneration, setReadyGeneration] = useState(0)
  // The instance is only created once subtitles are first wanted — and then kept,
  // so switching them off and on again doesn't pay the WASM start-up a second time.
  const [wanted, setWanted] = useState(Boolean(subUrl))
  if (subUrl && !wanted) setWanted(true)

  useEffect(() => {
    subUrlRef.current = subUrl
  }, [subUrl])

  // ---- Instance lifecycle ----
  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container || !wanted) return

    let cancelled = false
    let current: { instance: JASSUB; canvas: HTMLCanvasElement } | null = null
    let initTimer: ReturnType<typeof setTimeout> | undefined

    const teardown = () => {
      if (initTimer) clearTimeout(initTimer)
      initTimer = undefined
      if (current) {
        current.instance.destroy().catch(() => {})
        current.canvas.remove()
        if (instanceRef.current === current.instance) instanceRef.current = null
        current = null
      }
    }

    const start = (attempt: number) => {
      if (cancelled) return
      const canvas = document.createElement("canvas")
      canvas.style.position = "absolute"
      canvas.style.pointerEvents = "none"
      container.appendChild(canvas)

      const instance = new JASSUB({
        video,
        canvas,
        subContent: EMPTY_TRACK,
        workerUrl,
        wasmUrl,
        modernWasmUrl,
        // Fonts embedded in the MKV (signs, and often the dialogue font too).
        fonts: fontUrls,
        // JASSUB defaults `defaultFont` to "liberation sans" when it's omitted, so
        // providing the font data under that exact key gives libass a guaranteed
        // fallback for every glyph. (Do NOT pass `defaultFont` — that suppresses
        // JASSUB's own fallback wiring.)
        availableFonts: { "liberation sans": fallbackFontUrl },
      })
      // When the script asks for a font that isn't embedded (very common — e.g.
      // "Trebuchet MS" on a Crunchyroll rip, or the "Arial" of a converted SRT),
      // JASSUB calls `_getLocalFont` to look it up. Route it to the server, which
      // resolves it from the system fonts (fontconfig, or the Windows fonts folder).
      const withFontResolver = instance as unknown as {
        _getLocalFont: (family: string) => Promise<Uint8Array | undefined>
      }
      withFontResolver._getLocalFont = async (family: string) => {
        try {
          const res = await fetch(`/api/subtitle-font?family=${encodeURIComponent(family)}`)
          if (!res.ok) return undefined
          return new Uint8Array(await res.arrayBuffer())
        } catch {
          return undefined
        }
      }
      current = { instance, canvas }

      let ready = false
      instance.ready
        .then(() => {
          ready = true
          if (cancelled || current?.instance !== instance) return
          if (initTimer) clearTimeout(initTimer)
          instanceRef.current = instance
          setReadyGeneration((generation) => generation + 1)
        })
        .catch(() => {})
      initTimer = setTimeout(() => {
        if (cancelled || ready) return
        teardown()
        if (attempt + 1 < MAX_INIT_ATTEMPTS) start(attempt + 1)
      }, INIT_TIMEOUT_MS)
    }

    start(0)

    return () => {
      cancelled = true
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, containerRef, wanted, fontsKey])

  // ---- Track data: windows around the playhead + the full track ----
  useEffect(() => {
    const video = videoRef.current
    const instance = instanceRef.current
    if (!video || !instance) return

    let cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()

    // Draw right now at the current position instead of waiting for the next video
    // frame — which never comes while paused.
    const repaint = () => {
      if (cancelled || instanceRef.current !== instance) return
      if (video.readyState < 2 || !video.videoWidth) return
      instance
        .manualRender(
          { mediaTime: video.currentTime, width: video.videoWidth, height: video.videoHeight, expectedDisplayTime: performance.now() },
          true
        )
        .catch(() => {})
    }

    // Hand libass every font the text asks for BEFORE drawing it. Left to itself,
    // JASSUB fetches a missing font lazily during a render: that first render comes
    // out blank ("failed to find any fallback … for font: Arial") and only the NEXT
    // frame shows the line — and while paused there is no next frame, so a subtitle
    // picked on a paused video stayed invisible until playback resumed.
    const loadedFonts = loadedFontsFor(instance)
    const prepareFonts = async (text: string) => {
      const wanted = fontFamilies(text).filter((family) => !loadedFonts.has(family.toLowerCase()))
      if (wanted.length === 0) return
      for (const family of wanted) loadedFonts.add(family.toLowerCase())
      const fonts = (await Promise.all(wanted.map(fetchSystemFont))).filter((font): font is Uint8Array => font !== null)
      if (fonts.length > 0 && !cancelled) await instance.renderer.addFonts(fonts).catch(() => {})
    }

    // Serialised, so a slower font fetch for an earlier track can't land its
    // setTrack after a later one.
    let queue: Promise<unknown> = Promise.resolve()
    const enqueue = (step: () => Promise<unknown>) => {
      queue = queue.then(step).catch(() => {})
    }
    const show = (content: string) => {
      enqueue(async () => {
        if (cancelled || instanceRef.current !== instance) return
        await prepareFonts(content)
        if (cancelled || instanceRef.current !== instance) return
        await instance.renderer.setTrack(content)
        repaint()
      })
    }
    const append = (lines: string[]) => {
      enqueue(async () => {
        if (cancelled || instanceRef.current !== instance) return
        const text = lines.join("\n")
        await prepareFonts(text)
        if (cancelled || instanceRef.current !== instance) return
        await instance.renderer.processData(text)
        repaint()
      })
    }

    if (!subUrl) {
      show(EMPTY_TRACK)
      return () => {
        cancelled = true
      }
    }

    const url = subUrl
    let data = tracksRef.current.get(url)
    if (!data) {
      data = newTrackData()
      tracksRef.current.set(url, data)
    }
    const track = data
    const isCurrent = () => !cancelled && subUrlRef.current === url

    // Whatever is already known about this track goes up immediately.
    if (track.complete) show(track.full)
    else if (track.header) show(partialTrack(track))
    else show(EMPTY_TRACK)

    const acceptFull = (text: string) => {
      track.complete = true
      track.full = text
      track.lines.clear()
      track.ranges = []
      track.onFull?.()
    }

    track.onFull = () => {
      if (isCurrent()) show(track.full)
    }
    track.onLines = (fresh, first) => {
      if (track.complete || !isCurrent()) return
      if (first) show(partialTrack(track))
      else if (fresh.length > 0) append(fresh)
    }

    const requestFull = () => {
      if (track.complete || track.fullRequested) return
      track.fullRequested = true
      // Not tied to this effect's lifetime: if the viewer switches away and back,
      // the result is still cached for them.
      fetch(url)
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
        .then(acceptFull)
        .catch(() => {
          track.fullRequested = false
        })
    }

    const covered = (time: number) =>
      track.ranges.some(([from, to]) => from <= time && time < to - WINDOW_PREFETCH_S)

    const ensureWindow = () => {
      if (!isCurrent() || track.complete || track.windowInFlight) return
      const time = video.currentTime
      if (!Number.isFinite(time) || covered(time)) return
      const start = Math.max(0, time - WINDOW_BEFORE_S)
      const end = time + WINDOW_AFTER_S
      track.windowInFlight = true
      fetch(withWindow(url, start, end))
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status))
          const text = await res.text()
          if (res.headers.get("X-Subtitle-Complete") === "1") {
            acceptFull(text)
            return
          }
          const { header, lines } = splitAss(text)
          const fresh = lines.filter((line) => !track.lines.has(line))
          const first = !track.header
          if (first) track.header = header
          for (const line of fresh) track.lines.add(line)
          track.ranges.push([start, end])
          track.onLines?.(fresh, first)
        })
        .catch(() => {
          // Transient (server busy, network hiccup) — try again shortly.
          const timer = setTimeout(() => {
            timers.delete(timer)
            track.kick?.()
          }, WINDOW_RETRY_MS)
          timers.add(timer)
        })
        .finally(() => {
          track.windowInFlight = false
          // The playhead may have moved on (or jumped) while this one was loading.
          track.kick?.()
        })
    }
    track.kick = ensureWindow

    requestFull()
    ensureWindow()
    video.addEventListener("timeupdate", ensureWindow)
    video.addEventListener("seeking", ensureWindow)
    return () => {
      cancelled = true
      if (track.kick === ensureWindow) {
        track.kick = undefined
        track.onFull = undefined
        track.onLines = undefined
      }
      video.removeEventListener("timeupdate", ensureWindow)
      video.removeEventListener("seeking", ensureWindow)
      for (const timer of timers) clearTimeout(timer)
    }
  }, [videoRef, subUrl, readyGeneration])

  // Forget cached tracks when the player goes away.
  useEffect(() => {
    const tracks = tracksRef.current
    return () => tracks.clear()
  }, [])
}
