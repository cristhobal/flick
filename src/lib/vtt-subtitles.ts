// Client-side WebVTT parsing + a custom cue picker, so plain-text subtitle tracks
// (SRT / mov_text / WebVTT, converted to VTT server-side) render through our own
// styled overlay instead of the browser's default <track> box.
//
// Why not native <track>: its rendering can't be restyled beyond a handful of
// ::cue properties, it's positioned relative to the <video> element (awkward with
// our custom chrome), and — the real reason — its cue timing is driven by the
// muted clock-video, not by the separate <audio> element the viewer actually
// hears. Parsing the cues ourselves lets the overlay pick the active line off
// whatever clock we hand it (see LocalVideoPlayer's getSubtitleTime) and look the
// way a modern streaming player's subtitles look.
import { useEffect, useState } from "react"

export interface SubtitleCue {
  start: number
  end: number
  // Pre-sanitised to a tiny safe subset of inline markup (<i>/<b>/<u>) plus <br>.
  html: string
}

// HH:MM:SS.mmm or MM:SS.mmm, tolerating a comma decimal separator (SRT style).
const TIMESTAMP = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

function parseTimestamp(raw: string): number {
  const m = raw.match(TIMESTAMP)
  if (!m) return NaN
  const hours = m[1] ? parseInt(m[1], 10) : 0
  const minutes = parseInt(m[2], 10)
  const seconds = parseInt(m[3], 10)
  const millis = parseInt(m[4].padEnd(3, "0").slice(0, 3), 10)
  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

function sanitise(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return escaped
    // Keep basic styling tags…
    .replace(/&lt;(\/?)(i|b|u)&gt;/gi, "<$1$2>")
    // …drop every other VTT tag (<c.classes>, <v Speaker>, <lang>, <00:00:00.000>)
    // while keeping the text between them.
    .replace(/&lt;\/?[a-z][^&]*?&gt;/gi, "")
    .replace(/\n/g, "<br>")
    .trim()
}

export function parseVtt(raw: string): SubtitleCue[] {
  const body = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const cues: SubtitleCue[] = []
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n")
    const arrowIdx = lines.findIndex((line) => line.includes("-->"))
    if (arrowIdx === -1) continue
    const [rawStart, rawRest] = lines[arrowIdx].split("-->")
    const start = parseTimestamp(rawStart ?? "")
    const end = parseTimestamp(rawRest ?? "")
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const html = sanitise(lines.slice(arrowIdx + 1).join("\n"))
    if (html) cues.push({ start, end, html })
  }
  cues.sort((a, b) => a.start - b.start)
  return cues
}

// Fetches and parses the VTT at `url` once, returning the cue list — empty until
// it has loaded, on error, when `url` is null, or right after `url` changes (so a
// track switch never briefly shows the previous track's lines).
export function useParsedSubtitles(url: string | null): SubtitleCue[] {
  const [loaded, setLoaded] = useState<{ url: string; cues: SubtitleCue[] }>({ url: "", cues: [] })

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!cancelled) setLoaded({ url, cues: text ? parseVtt(text) : [] })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ url, cues: [] })
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return url && loaded.url === url ? loaded.cues : []
}

// Every cue active at `time`, joined with <br> (overlapping cues do happen —
// signs + dialogue). Cues are start-sorted, so bail once we pass `time`.
export function activeCueHtml(cues: SubtitleCue[], time: number): string {
  let html = ""
  for (const cue of cues) {
    if (cue.start > time) break
    if (time < cue.end) html = html ? `${html}<br>${cue.html}` : cue.html
  }
  return html
}
