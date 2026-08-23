// Thin wrapper around JASSUB (WASM libass) so ASS/SSA subtitle tracks render with
// their real styling — fonts, colors, outlines, positioning, \tags — instead of being
// flattened to plain WebVTT text. JASSUB attaches directly to the <video> element and
// reads its currentTime itself (via requestVideoFrameCallback), so it stays in sync
// with the master clock automatically, including across seeks — no manual sync code
// needed here, unlike the audio track (see media-sync.ts).
import { useEffect, useRef } from "react"
import JASSUB from "jassub"
// eslint-disable-next-line import/no-unresolved
import workerUrl from "jassub/dist/wasm/jassub-worker.js?url"
// eslint-disable-next-line import/no-unresolved
import wasmUrl from "jassub/dist/wasm/jassub-worker.wasm?url"
// eslint-disable-next-line import/no-unresolved
import modernWasmUrl from "jassub/dist/wasm/jassub-worker-modern.wasm?url"

export function useAssSubtitle(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  subUrl: string | null,
  fontUrls: string[]
) {
  const instanceRef = useRef<JASSUB | null>(null)
  const fontsKey = fontUrls.join(",")

  useEffect(() => {
    const video = videoRef.current
    if (!video || !subUrl) return

    const instance = new JASSUB({
      video,
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
  }, [videoRef, subUrl, fontsKey])
}
