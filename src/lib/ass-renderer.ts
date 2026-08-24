// Thin wrapper around JASSUB (WASM libass) so ASS/SSA subtitle tracks render with
// their real styling — fonts, colors, outlines, positioning, \tags — instead of being
// flattened to plain WebVTT text. JASSUB attaches directly to the <video> element and
// reads its currentTime itself (via requestVideoFrameCallback), so it stays in sync
// with the master clock automatically, including across seeks — no manual sync code
// needed here, unlike the audio track (see media-sync.ts).
//
// The canvas JASSUB paints into must be a React-rendered element (passed in via
// canvasRef), not one JASSUB inserts itself with insertAdjacentElement. LocalVideoPlayer
// re-renders on every timeupdate/chrome-visibility change, and React's reconciler owns
// every child of the player container — a DOM node JASSUB spliced in behind React's back
// gets silently dropped the next time React touches that container's children, which is
// why subtitles would flash in then vanish. JASSUB still resizes/positions the canvas
// itself (see resize() in jassub.js): it just needs the canvas to already exist.
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

export function useAssSubtitle(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  subUrl: string | null,
  fontUrls: string[]
) {
  const instanceRef = useRef<JASSUB | null>(null)
  const fontsKey = fontUrls.join(",")

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !subUrl) return

    const instance = new JASSUB({
      video,
      canvas,
      subUrl,
      workerUrl,
      wasmUrl,
      modernWasmUrl,
      fonts: fontUrls,
      defaultFont: "Arial",
    })
    instanceRef.current = instance

    return () => {
      instance.destroy().catch(() => {})
      if (instanceRef.current === instance) instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, canvasRef, subUrl, fontsKey])
}
