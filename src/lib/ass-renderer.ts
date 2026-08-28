// Thin wrapper around JASSUB (WASM libass) so ASS/SSA subtitle tracks render with
// their real styling — fonts, colors, outlines, positioning, \tags — instead of being
// flattened to plain WebVTT text. JASSUB attaches directly to the <video> element and
// reads its currentTime itself (via requestVideoFrameCallback), so it stays in sync
// with the master clock automatically, including across seeks — no manual sync code
// needed here, unlike the audio track (see media-sync.ts).
//
// Canvas ownership: JASSUB *transfers control of its canvas to an OffscreenCanvas*
// in its constructor (`canvas.transferControlToOffscreen()`), and a canvas can only
// be transferred once ever. So the canvas can NOT be a React-rendered element reused
// across instances — switching subtitle track (or a StrictMode double-mount) would
// build a second JASSUB on the same node and throw
// "Cannot transfer control from a canvas for more than one time", leaving ASS
// subtitles blank. Instead React owns a stable, empty container <div> (passed via
// containerRef) and this hook creates a brand-new <canvas> inside it per instance,
// removing it on cleanup. The div has no React children, so React never reconciles
// — and drops — the canvas we splice in.
import { useEffect, useRef } from "react"
import JASSUB from "jassub"
// The worker script is dist/worker/worker.js — the RPC wrapper that actually exposes
// the ASSRenderer class (via abslink/comlink) for the main thread to talk to. It's easy
// to mistake dist/wasm/jassub-worker.js for the worker entry point since it also looks
// like a "worker" script, but that file is only the Emscripten-generated WASM glue that
// worker.js imports internally — pointing workerUrl at it spins up a worker that never
// answers the RPC handshake, so `instance.ready` just hangs forever with no error.
// eslint-disable-next-line import/no-unresolved
import workerUrl from "jassub/dist/worker/worker.js?worker&url"
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

export function useAssSubtitle(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  containerRef: React.RefObject<HTMLElement | null>,
  subUrl: string | null,
  fontUrls: string[]
) {
  const instanceRef = useRef<JASSUB | null>(null)
  const fontsKey = fontUrls.join(",")

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container || !subUrl) return

    // Fresh canvas per instance — see the ownership note above.
    const canvas = document.createElement("canvas")
    canvas.style.position = "absolute"
    canvas.style.inset = "0"
    canvas.style.pointerEvents = "none"
    container.appendChild(canvas)

    const instance = new JASSUB({
      video,
      canvas,
      subUrl,
      workerUrl,
      wasmUrl,
      modernWasmUrl,
      fonts: fontUrls,
      // JASSUB defaults `defaultFont` to "liberation sans" when it's omitted, so
      // providing the font data under that exact key gives libass a guaranteed
      // fallback for every glyph. (Do NOT pass `defaultFont` — that suppresses
      // JASSUB's own fallback wiring.)
      availableFonts: { "liberation sans": fallbackFontUrl },
    })
    instanceRef.current = instance

    return () => {
      instance.destroy().catch(() => {})
      if (instanceRef.current === instance) instanceRef.current = null
      canvas.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, containerRef, subUrl, fontsKey])
}
