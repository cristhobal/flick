// Runs inside the JASSUB worker, before JASSUB's own code (see jassub-worker.ts).
//
// Every JASSUB renderer (WebGL2, WebGL1, 2D) asks for its canvas context with
// `desynchronized: true` — Chrome's low-latency canvas, which may draw straight to
// the display, bypassing the compositor. On Android, Chrome takes that path once the
// canvas is large enough to count as fullscreen, and there the canvas' alpha is not
// honoured: the subtitles come out on a solid black box the size of the picture,
// hiding the video and the controls under it. Inline (smaller) the same canvas is
// composited normally, so it only ever showed in fullscreen.
//
// Subtitles don't need low latency — they change a few times a second at most — so
// every context the worker creates is made a regular, composited one. Nothing else
// about the context changes.
type GetContext = (this: OffscreenCanvas, type: string, options?: Record<string, unknown>) => unknown

const getContext = OffscreenCanvas.prototype.getContext as unknown as GetContext

;(OffscreenCanvas.prototype as unknown as { getContext: GetContext }).getContext = function (type, options) {
  return getContext.call(this, type, options ? { ...options, desynchronized: false } : options)
}

export {}
