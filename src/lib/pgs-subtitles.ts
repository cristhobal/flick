// Blu-ray PGS ("HDMV presentation graphics") subtitles: parsing and decoding.
//
// PGS subtitles are pictures, not text — each cue is a small paletted bitmap with a
// position — so the text/ASS paths can't show them. The dev server hands over the
// track as a raw .sup stream (`/api/local-subtitle-pgs/…`, see servePgs in
// scripts/local-media-server.mjs) and this module turns it into timed bitmaps.
//
// A .sup file is a sequence of segments, each `"PG" | pts(4) | dts(4) | type(1) |
// size(2) | payload`, grouped into "display sets" that end with an END segment:
//   PCS 0x16  presentation composition — which objects appear, where, and the state
//             (0x80 = epoch start: everything from before is discarded)
//   WDS 0x17  window definitions (positions only; the PCS positions are what we use)
//   PDS 0x14  palette: index → (Y, Cr, Cb, alpha)
//   ODS 0x15  object: the RLE-compressed bitmap (may span several segments)
//   END 0x80
// A display set with objects shows them from its PTS; one without clears the screen.
//
// Extraction of a big file is progressive, so the parser is incremental: feed it bytes
// as they arrive and it yields cues as soon as their display set is complete.
import { useEffect, useRef } from "react"

const PTS_HZ = 90000

interface PgsObject {
  width: number
  height: number
  data: Uint8Array
}

export interface PgsItem {
  x: number
  y: number
  cropX: number
  cropY: number
  cropW: number
  cropH: number
  object: PgsObject
  /** RGBA, 256 entries. */
  palette: Uint8ClampedArray
  /** Decoded lazily the first time the cue is shown. */
  canvas?: HTMLCanvasElement | null
}

export interface PgsCue {
  start: number
  /** Infinity until the next display set (which clears or replaces it) arrives. */
  end: number
  /** Coordinate space the item positions are expressed in (the video frame size). */
  width: number
  height: number
  items: PgsItem[]
}

interface PendingObject {
  width: number
  height: number
  expected: number
  chunks: Uint8Array[]
  size: number
}

interface Composition {
  pts: number
  width: number
  height: number
  state: number
  paletteId: number
  objects: Array<{ id: number; x: number; y: number; cropX: number; cropY: number; cropW: number; cropH: number; cropped: boolean }>
}

function ycrcbToRgba(y: number, cr: number, cb: number, a: number, hd: boolean, out: Uint8ClampedArray, offset: number) {
  const yy = 1.164 * (y - 16)
  const r = hd ? yy + 1.793 * (cr - 128) : yy + 1.596 * (cr - 128)
  const g = hd ? yy - 0.213 * (cb - 128) - 0.533 * (cr - 128) : yy - 0.392 * (cb - 128) - 0.813 * (cr - 128)
  const b = hd ? yy + 2.112 * (cb - 128) : yy + 2.017 * (cb - 128)
  // Uint8ClampedArray clamps for us.
  out[offset] = r
  out[offset + 1] = g
  out[offset + 2] = b
  out[offset + 3] = a
}

export class PgsParser {
  readonly cues: PgsCue[] = []
  private carry: Uint8Array = new Uint8Array(0)
  private palettes = new Map<number, Uint8ClampedArray>()
  private objects = new Map<number, PgsObject>()
  private pending = new Map<number, PendingObject>()
  private composition: Composition | null = null
  private hd = true

  /** Feed the next bytes of the stream. Returns how many complete cues were added. */
  push(bytes: Uint8Array): number {
    let data = bytes
    if (this.carry.length > 0) {
      data = new Uint8Array(this.carry.length + bytes.length)
      data.set(this.carry, 0)
      data.set(bytes, this.carry.length)
    }
    const before = this.cues.length
    let offset = 0
    while (offset + 13 <= data.length) {
      if (data[offset] !== 0x50 || data[offset + 1] !== 0x47) {
        // Lost sync (shouldn't happen on a clean .sup): skip to the next "PG".
        offset++
        continue
      }
      const size = (data[offset + 11] << 8) | data[offset + 12]
      if (offset + 13 + size > data.length) break // segment not fully here yet
      const view = new DataView(data.buffer, data.byteOffset + offset, 13 + size)
      const pts = view.getUint32(2) / PTS_HZ
      const type = data[offset + 10]
      this.segment(type, pts, data.subarray(offset + 13, offset + 13 + size))
      offset += 13 + size
    }
    this.carry = data.slice(offset)
    return this.cues.length - before
  }

  private segment(type: number, pts: number, payload: Uint8Array) {
    switch (type) {
      case 0x16:
        this.presentation(pts, payload)
        break
      case 0x14:
        this.palette(payload)
        break
      case 0x15:
        this.objectData(payload)
        break
      case 0x80:
        this.endOfSet()
        break
      default:
        break // WDS and unknown segments carry nothing we need
    }
  }

  private presentation(pts: number, p: Uint8Array) {
    if (p.length < 11) return
    const view = new DataView(p.buffer, p.byteOffset, p.byteLength)
    const width = view.getUint16(0)
    const height = view.getUint16(2)
    const state = p[7]
    const paletteId = p[9]
    const count = p[10]
    this.hd = width >= 1280
    const objects: Composition["objects"] = []
    let at = 11
    for (let i = 0; i < count; i++) {
      if (at + 8 > p.length) break
      // 0x40 = cropped (four more coordinates follow); 0x80 only marks a forced cue.
      const cropped = (p[at + 3] & 0x40) !== 0
      const item = {
        id: view.getUint16(at),
        x: view.getUint16(at + 4),
        y: view.getUint16(at + 6),
        cropX: 0,
        cropY: 0,
        cropW: 0,
        cropH: 0,
        cropped,
      }
      at += 8
      if (cropped && at + 8 <= p.length) {
        item.cropX = view.getUint16(at)
        item.cropY = view.getUint16(at + 2)
        item.cropW = view.getUint16(at + 4)
        item.cropH = view.getUint16(at + 6)
        at += 8
      }
      objects.push(item)
    }
    // An epoch start throws away every object and palette from before it.
    if (state === 0x80) {
      this.objects.clear()
      this.palettes.clear()
      this.pending.clear()
    }
    this.composition = { pts, width, height, state, paletteId, objects }
  }

  private palette(p: Uint8Array) {
    if (p.length < 2) return
    const id = p[0]
    // Entries not redefined keep their previous value within the same palette id.
    const palette = new Uint8ClampedArray(this.palettes.get(id) || new Uint8ClampedArray(256 * 4))
    for (let at = 2; at + 5 <= p.length; at += 5) {
      const index = p[at]
      ycrcbToRgba(p[at + 1], p[at + 2], p[at + 3], p[at + 4], this.hd, palette, index * 4)
    }
    this.palettes.set(id, palette)
  }

  private objectData(p: Uint8Array) {
    if (p.length < 4) return
    const view = new DataView(p.buffer, p.byteOffset, p.byteLength)
    const id = view.getUint16(0)
    const sequence = p[3]
    const first = (sequence & 0x80) !== 0
    const last = (sequence & 0x40) !== 0
    let pending = this.pending.get(id)
    if (first) {
      if (p.length < 11) return
      pending = {
        expected: (p[4] << 16) | (p[5] << 8) | p[6],
        width: view.getUint16(7),
        height: view.getUint16(9),
        chunks: [p.subarray(11)],
        size: p.length - 11,
      }
      this.pending.set(id, pending)
    } else if (pending) {
      pending.chunks.push(p.subarray(4))
      pending.size += p.length - 4
    } else {
      return
    }
    if (last && pending) {
      const data = new Uint8Array(pending.size)
      let at = 0
      for (const chunk of pending.chunks) {
        data.set(chunk, at)
        at += chunk.length
      }
      this.objects.set(id, { width: pending.width, height: pending.height, data })
      this.pending.delete(id)
    }
  }

  private endOfSet() {
    const comp = this.composition
    this.composition = null
    if (!comp) return
    // Whatever was showing ends now, whether this set clears it or replaces it.
    const previous = this.cues[this.cues.length - 1]
    if (previous && previous.end === Infinity) previous.end = comp.pts
    if (comp.objects.length === 0) return
    const palette = this.palettes.get(comp.paletteId)
    if (!palette) return
    const items: PgsItem[] = []
    for (const ref of comp.objects) {
      const object = this.objects.get(ref.id)
      if (!object) continue
      items.push({
        x: ref.x,
        y: ref.y,
        cropX: ref.cropped ? ref.cropX : 0,
        cropY: ref.cropped ? ref.cropY : 0,
        cropW: ref.cropped ? ref.cropW : object.width,
        cropH: ref.cropped ? ref.cropH : object.height,
        object,
        palette,
      })
    }
    if (items.length === 0) return
    this.cues.push({ start: comp.pts, end: Infinity, width: comp.width, height: comp.height, items })
  }
}

// RLE bitmap → canvas. PGS run-length coding: a non-zero byte is one pixel of that
// palette colour; a zero byte introduces a run — `00 00` end of line, `00 0L` L
// transparent pixels, `00 4H L` (H<<8|L) transparent, `00 8L C` L pixels of colour C,
// `00 CH L C` (H<<8|L) pixels of colour C.
export function decodeItem(item: PgsItem): HTMLCanvasElement | null {
  if (item.canvas !== undefined) return item.canvas
  const { width, height, data } = item.object
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096 || typeof document === "undefined") {
    item.canvas = null
    return null
  }
  const image = new ImageData(width, height)
  const pixels = image.data
  const palette = item.palette
  let i = 0
  let x = 0
  let y = 0
  const put = (color: number, length: number) => {
    if (y >= height) return
    const end = Math.min(x + length, width)
    const a = palette[color * 4 + 3]
    if (a !== 0) {
      const r = palette[color * 4]
      const g = palette[color * 4 + 1]
      const b = palette[color * 4 + 2]
      for (let px = x; px < end; px++) {
        const at = (y * width + px) * 4
        pixels[at] = r
        pixels[at + 1] = g
        pixels[at + 2] = b
        pixels[at + 3] = a
      }
    }
    x += length
  }
  while (i < data.length && y < height) {
    const byte = data[i++]
    if (byte !== 0) {
      put(byte, 1)
      continue
    }
    const flag = data[i++]
    if (flag === undefined) break
    if (flag === 0) {
      x = 0
      y++
      continue
    }
    let length: number
    let color = 0
    if (flag < 0x40) {
      length = flag
    } else if (flag < 0x80) {
      length = ((flag & 0x3f) << 8) | data[i++]
    } else if (flag < 0xc0) {
      length = flag & 0x3f
      color = data[i++]
    } else {
      length = ((flag & 0x3f) << 8) | data[i++]
      color = data[i++]
    }
    put(color, length)
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")?.putImageData(image, 0, 0)
  item.canvas = canvas
  return canvas
}

/** The cue showing at `time`, or null. `cues` is in chronological order. */
export function activePgsCue(cues: PgsCue[], time: number): PgsCue | null {
  let low = 0
  let high = cues.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (cues[mid].start <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (found < 0) return null
  const cue = cues[found]
  return time < cue.end ? cue : null
}

const POLL_MS = 2500
const STREAM_POLL_MS = 700

// Downloads a PGS track and keeps `cuesRef.current` filled in as data arrives. The
// server extracts in the background, so it answers with whatever exists so far
// (`X-Flick-Complete: 0`) until the whole track is on disk; this keeps asking for the
// bytes after what it already has. The ref is mutated in place (never replaced) so a
// renderer polling it each frame sees new cues without React re-rendering.
export function usePgsSubtitles(url: string | null) {
  const cuesRef = useRef<PgsCue[]>([])

  useEffect(() => {
    cuesRef.current = []
    if (!url) return
    let cancelled = false
    const parser = new PgsParser()
    cuesRef.current = parser.cues
    let received = 0

    const run = async () => {
      while (!cancelled) {
        let delay = POLL_MS
        try {
          const response = await fetch(`${url}&offset=${received}`)
          if (cancelled) return
          if (response.status === 404) {
            // Either not a PGS track, or (more often when it "just doesn't show") the dev
            // server predates this endpoint: scripts/local-media-server.mjs is loaded
            // once at startup and is NOT hot-reloaded, so it needs a restart.
            const isHtml = (response.headers.get("Content-Type") || "").includes("text/html")
            console.warn(
              isHtml
                ? "[PGS] /api/local-subtitle-pgs not found — restart the dev server so it loads the latest scripts/local-media-server.mjs."
                : "[PGS] that subtitle track isn't PGS."
            )
            return
          }
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer())
            if (cancelled) return
            received += bytes.length
            if (bytes.length > 0) parser.push(bytes)
            if (response.headers.get("X-Flick-Complete") === "1") return
            if (bytes.length > 0) delay = STREAM_POLL_MS
          }
        } catch {
          // Server hiccup — try again shortly.
        }
        await new Promise((resolve) => window.setTimeout(resolve, delay))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [url])

  return cuesRef
}
