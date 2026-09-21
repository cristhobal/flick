"use client"

// Draws Blu-ray PGS bitmap subtitles over the video. Same shape as the text
// SubtitleView in LocalVideoPlayer: a rAF loop reads the player clock, finds the
// active cue and only repaints when something actually changed (a new cue, or the
// size of the video/box). Bitmaps carry their own position in the video frame's
// coordinate space, so they're scaled to wherever the picture really is inside the
// letterboxed <video> box.
import { useEffect, useRef, type RefObject } from "react"
import { activePgsCue, decodeItem, type PgsCue } from "@/lib/pgs-subtitles"

interface PgsSubtitleViewProps {
  cuesRef: RefObject<PgsCue[]>
  getTime: () => number
  videoRef: RefObject<HTMLVideoElement | null>
}

export default function PgsSubtitleView({ cuesRef, getTime, videoRef }: PgsSubtitleViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0
    let lastKey = ""
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video) return
      const boxWidth = canvas.clientWidth
      const boxHeight = canvas.clientHeight
      if (boxWidth === 0 || boxHeight === 0) return

      const dpr = window.devicePixelRatio || 1
      const pixelWidth = Math.round(boxWidth * dpr)
      const pixelHeight = Math.round(boxHeight * dpr)
      const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight
      if (resized) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }

      const cue = activePgsCue(cuesRef.current, getTime())
      const key = `${cue ? cue.start : "none"}|${pixelWidth}x${pixelHeight}|${video.videoWidth}x${video.videoHeight}`
      if (key === lastKey && !resized) return
      lastKey = key

      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!cue) return

      // Where the picture sits inside the box (object-fit: contain), in canvas pixels.
      const frameWidth = video.videoWidth || cue.width
      const frameHeight = video.videoHeight || cue.height
      const fit = Math.min(boxWidth / frameWidth, boxHeight / frameHeight)
      const drawnWidth = frameWidth * fit
      const drawnHeight = frameHeight * fit
      const originX = (boxWidth - drawnWidth) / 2
      const originY = (boxHeight - drawnHeight) / 2
      // Cue coordinates are in the composition's own frame size (usually == video size).
      const scale = (drawnWidth / cue.width) * dpr

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      for (const item of cue.items) {
        const bitmap = decodeItem(item)
        if (!bitmap) continue
        ctx.drawImage(
          bitmap,
          item.cropX,
          item.cropY,
          item.cropW,
          item.cropH,
          (originX + 0) * dpr + item.x * scale,
          (originY + 0) * dpr + item.y * scale,
          item.cropW * scale,
          item.cropH * scale
        )
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cuesRef, getTime, videoRef])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
}
