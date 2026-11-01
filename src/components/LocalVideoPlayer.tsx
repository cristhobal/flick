"use client"

// Custom VLC-style player for local files (dev-only local library).
//
// Architecture: the <video> element is muted and is the single master clock — its
// src is the raw file (byte-range seekable, native instant seeking) and it is NEVER
// reloaded when the user switches audio/subtitle tracks. Sound comes from a separate,
// hidden <audio> element sourced from a per-track ffmpeg transcode
// (/api/local-audio/...), kept locked to the video via useMediaSync (continuous
// play/pause/drift correction) plus a direct reload-on-seek path here (any jump needs
// a fresh transcoded stream from the new position — see reloadAudio). Subtitles:
// plain text (SRT/mov_text → VTT) is parsed client-side and painted by our own
// styled overlay (SubtitleView + vtt-subtitles.ts); ASS/SSA goes through JASSUB
// (WASM libass) so original styling, fonts and positioning survive — see
// ass-renderer.ts. Both are timed off the <audio> clock the viewer actually
// hears, not the muted clock-video, via getSubtitleTime.
//
// Files a browser can't open at all (.m2ts/MPEG-TS, AVI, …) use a different, simpler
// arrangement — "remux mode": the server sends ONE fragmented MP4 holding picture and
// the chosen audio track (same ffmpeg process, same timeline), a RemuxStream feeds it
// to the <video> through MediaSource, and the <video> itself plays the sound. There is
// no <audio> element and nothing to keep in sync, so the paths below that exist only to
// lock two elements together (useMediaSync, reloadAudio, the audio watchdog) are off.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/i18n/I18nProvider"
import { useMediaSync } from "@/lib/media-sync"
import { useAssSubtitle } from "@/lib/ass-renderer"
import { resolveEpisodeMarkers, type MarkerInterval } from "@/lib/episode-markers"
import { activeCueHtml, useParsedSubtitles, type SubtitleCue } from "@/lib/vtt-subtitles"
import { backdropUrl, posterUrl, type Movie } from "@/lib/data"
import { clearWatchProgress, getWatchProgress, saveWatchProgress } from "@/lib/watch-progress"
import {
  fileKey,
  GLOBAL_PREFS_KEY,
  getMediaPrefs,
  loadMediaPrefs,
  resolveAudioIndex,
  resolveSubtitleIndex,
  saveMediaPrefs,
  showKey,
} from "@/lib/media-prefs"
import { RemuxStream } from "@/lib/remux-stream"
import { usePgsSubtitles } from "@/lib/pgs-subtitles"
import PgsSubtitleView from "@/components/PgsSubtitleView"
import {
  Pause,
  Play,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Languages,
  Subtitles as SubtitlesIcon,
  Gauge,
  RotateCcw,
  RotateCw,
  Star,
  SkipForward,
  SkipBack,
  Rewind,
  FastForward,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

const VIDEO_API_PREFIX = "/api/local-video/"
const THUMBNAIL_API_PREFIX = "/api/local-thumbnail/"
const THUMBNAIL_PREGEN_API_PREFIX = "/api/local-thumbnail-pregenerate/"
const OFF_VALUE = "off"

// Shared look of the audio and subtitle menus. The content is a column so only the
// track list scrolls, inside the app's ScrollArea (the "Audio" / "Subtítulos" header
// stays put), also when the menu is squeezed by a short window (Radix's
// available-height cap on the content). The list's cap comes in as
// --track-list-max (see trackListStyle) and is applied to the ScrollArea viewport —
// the Root has no height of its own to constrain.
const TRACK_MENU_CLASS = "flex w-52 flex-col overflow-hidden border-neutral-800 bg-neutral-950 text-neutral-200"
const TRACK_SCROLL_CLASS = "min-h-0"
const TRACK_VIEWPORT_CLASS = "max-h-(--track-list-max) overscroll-contain"

// On open, scroll the list to the track in use — with dozens of subtitle tracks it
// can sit far below the fold.
function revealCheckedTrack(viewport: HTMLDivElement | null) {
  viewport?.querySelector<HTMLElement>("[data-state=checked]")?.scrollIntoView({ block: "nearest" })
}
// Containers no browser opens in a <video> element — always played through remux mode
// (the server's own list, NON_NATIVE_CONTAINERS, has to match).
const NON_NATIVE_FILE_RE = /\.(m2ts|mts|ts|mpe?g|avi|wmv|flv)$/i
const SEEK_RELOAD_DEBOUNCE_MS = 250
// Audio / subtitle menus: one height for both. A row is text-xs (16px) + py-1.5
// (12px). The lists are capped at the audio menu's row count (at least
// TRACK_MENU_MIN_ROWS), so a file with dozens of subtitle tracks gets a subtitle menu
// exactly as tall as its audio one, scrolling inside, instead of a tower.
const TRACK_MENU_ROW_PX = 28
const TRACK_MENU_MIN_ROWS = 8
// Below this, a video.currentTime jump isn't treated as a real seek — see onSeeking/onSeeked.
const SEEK_RELOAD_MIN_JUMP_S = 1.5
// Headroom to leave before the end of a buffered audio range when seeking inside it.
// Landing right on the edge stalls the element immediately, which would sound exactly
// like the refetch the in-buffer path exists to avoid.
const AUDIO_BUFFER_SEEK_MARGIN_S = 0.35
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const CONTROLS_IDLE_MS = 2800
// Below this player size (either side) the overlays switch to a compact layout: a
// phone in portrait (narrow) or in landscape (short — wider than the "sm" breakpoint,
// so viewport breakpoints alone would give it the desktop sizes).
const COMPACT_MAX_WIDTH = 640
const COMPACT_MAX_HEIGHT = 420
// Shorter still (a phone in portrait, player inline): the pause card drops its synopsis.
const TINY_MAX_HEIGHT = 300
// Narrower than this (a phone in portrait), buttons drop their labels.
const NARROW_MAX_WIDTH = 520

// The "picture" for taps: the video and the pause card. Anything else under the
// pointer is a control.
function isPlayerSurface(target: HTMLElement): boolean {
  return Boolean(target.closest("[data-player-surface]"))
}
// How long the video has to sit paused before the streaming-style info card
// (artwork + title + season/episode + synopsis + rating) fades in over it.
const PAUSE_INFO_DELAY_MS = 5000
// "You're watching" card shown as an episode starts (see nowPlayingPhase).
const NOW_PLAYING_VISIBLE_MS = 5000
const NOW_PLAYING_FADE_MS = 500
const SKIP_SECONDS = 10
// Touch: press and hold the left half of the picture to rewind, the right half to
// fast-forward. The hold has to last HOLD_DELAY_MS without the finger wandering off
// (a drag is a scroll, a short touch is a tap), and the speed steps up the longer it
// lasts: [seconds held, speed].
const HOLD_DELAY_MS = 450
const HOLD_MOVE_TOLERANCE_PX = 12
const SCRUB_SPEED_STEPS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1.5, 2], [3, 4], [4.5, 8]]
// Stops short of the very end, so fast-forwarding never fires "ended" by itself.
const SCRUB_END_MARGIN_S = 0.25

function scrubSpeedFor(heldSeconds: number): number {
  let speed = SCRUB_SPEED_STEPS[0][1]
  for (const [after, value] of SCRUB_SPEED_STEPS) if (heldSeconds >= after) speed = value
  return speed
}
// How far the audio clock may stray from the video before subtitles stop trusting it.
const SUBTITLE_CLOCK_TOLERANCE_S = 0.4
// Fallback bucket size before video-info returns the server's real
// thumbnailInterval (which scales with duration) — only matters for the brief
// window before that first response lands.
const THUMBNAIL_BUCKET_FALLBACK_S = 5
// How long the pointer has to sit still on a new bucket before we bother
// fetching its thumbnail. The server pregenerates the whole scrub track in the
// background as soon as the episode loads (see the video-info effect below),
// so by the time anyone actually hovers this is almost always an instant disk
// cache hit — the debounce just guards the rare cold-cache case.
const THUMBNAIL_DEBOUNCE_MS = 60
const THUMBNAIL_PREVIEW_WIDTH = 160
// How often "Continue Watching" progress gets persisted while playing —
// frequent enough that a crash/force-quit doesn't lose much, infrequent
// enough that it's just an occasional localStorage write, not one per
// timeupdate tick (which fire ~4x/second).
const PROGRESS_SAVE_INTERVAL_MS = 5000
// Next-episode countdown length when the markers config doesn't set one, and how
// often it ticks.
const NEXT_COUNTDOWN_DEFAULT_S = 10
const COUNTDOWN_TICK_S = 0.25
// When neither the markers config nor chapter data pins down where credits actually start, fall back to
// treating the last N seconds of the file as "credits" — a rough guess, but
// better than nothing for files without chapter markers.
const CREDITS_FALLBACK_LAST_S = 45

// Prefixed Fullscreen API (Safari/iPadOS).
type FullscreenCapable = HTMLDivElement & { webkitRequestFullscreen?: () => void }
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }

interface Track {
  index: number
  codec: string
  language: string
  title: string
  format?: "vtt" | "ass" | "pgs"
  channels?: number
  // Codec/profile + channel layout ("DTS-HD MA 5.1") — what tells apart audio tracks
  // that carry no title or language.
  detail?: string
  forced?: boolean
  hearingImpaired?: boolean
  default?: boolean
}

// Human language names for the ISO 639-2 codes muxed files actually use, so a
// track shows "Español" instead of "spa". Falls through to the raw code.
const LANGUAGE_NAMES: Record<string, string> = {
  spa: "Español", eng: "Inglés", jpn: "Japonés", por: "Português", fra: "Francés",
  fre: "Francés", deu: "Alemán", ger: "Alemán", ita: "Italiano", rus: "Ruso",
  ara: "Árabe", kor: "Coreano", zho: "Chino", chi: "Chino", hin: "Hindi",
  ind: "Indonesio", tha: "Tailandés", vie: "Vietnamita", msa: "Malayo",
  tur: "Turco", pol: "Polaco", nld: "Neerlandés", swe: "Sueco",
}

// A label that actually disambiguates: language name + any forced/CC marker, and
// — when two tracks would still read identically — a trailing counter, so a
// full-dialogue track and a signs-only one that both carry just "spa" don't look
// like the same option.
function buildSubtitleLabels(tracks: Track[], fallback: (i: number) => string): string[] {
  const base = tracks.map((track, i) => {
    if (track.title) return track.title
    const lang = LANGUAGE_NAMES[track.language] || track.language
    if (!lang) return fallback(i)
    const marks: string[] = []
    if (track.forced) marks.push("forzados")
    if (track.hearingImpaired) marks.push("CC")
    return marks.length ? `${lang} (${marks.join(", ")})` : lang
  })
  return base.map((label, i) => {
    const dupes = base.filter((other) => other === label)
    if (dupes.length < 2) return label
    const ordinal = base.slice(0, i + 1).filter((other) => other === label).length
    return `${label} ${ordinal}`
  })
}

interface FontRef {
  index: number
  filename: string
  mimetype: string
}

interface Chapter {
  title: string
  start: number
  end: number
}

interface VideoInfo {
  audioTracks: Track[]
  subtitleTracks: Track[]
  fonts: FontRef[]
  chapters: Chapter[]
  duration: number
  thumbnailInterval: number
  // Container clock origin (MPEG-TS starts at e.g. 0.54s) and whether the server says
  // this file must go through the remux pipeline.
  startTime?: number
  remux?: boolean
  // Set when the server couldn't probe the file (track lists are then empty).
  error?: string
}

// Menu labels for audio tracks. Title and language name come first; the codec
// detail ("DTS-HD MA 5.1") follows, and is all there is for untagged tracks. Labels
// that would still read identically get a counter so two options never look the same.
function buildAudioLabels(tracks: Track[], fallback: (i: number) => string): string[] {
  const base = tracks.map((track, i) => {
    const name = track.title || LANGUAGE_NAMES[track.language] || track.language
    const label = [name, track.detail].filter(Boolean).join(" · ")
    return label || fallback(i)
  })
  return base.map((label, i) => {
    const dupes = base.filter((other) => other === label)
    if (dupes.length < 2) return label
    const ordinal = base.slice(0, i + 1).filter((other) => other === label).length
    return `${label} ${ordinal}`
  })
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// lucide-react only ships 0/1/2-bar speaker icons (no 3-bar variant), so the
// ladder is muted → 0 bars → 1 bar → 2 bars for low/medium/high respectively.
function VolumeIcon({ muted, volume, className }: { muted: boolean; volume: number; className?: string }) {
  if (muted || volume <= 0) return <VolumeX className={className} />
  if (volume <= 1 / 3) return <Volume className={className} />
  if (volume <= 2 / 3) return <Volume1 className={className} />
  return <Volume2 className={className} />
}

// lucide has no "replay 10 / forward 10" glyph (the "-10" rotate variants
// other icon sets ship), so this overlays the seconds count on the plain
// rotate-arrow icon — same convention as those dedicated icons.
function SkipIcon({ direction, seconds, className }: { direction: "back" | "forward"; seconds: number; className?: string }) {
  const Icon = direction === "back" ? RotateCcw : RotateCw
  return (
    <span className={cn("relative inline-flex", className)}>
      <Icon className="h-full w-full" />
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold leading-none tabular-nums">
        {seconds}
      </span>
    </span>
  )
}

// Styled subtitle overlay for plain-text tracks. A rAF loop reads `getTime()` —
// the audio clock, passed down from the player — picks the active cue, and only
// re-renders React when the visible line actually changes. Look is deliberately
// close to a modern streaming player: centred, semi-bold, heavy shadow + thin
// outline for legibility over any frame, no box, ~2 lines, at a fixed low
// position that never shifts when the controls appear or disappear.
function SubtitleView({
  cues,
  getTime,
}: {
  cues: SubtitleCue[]
  getTime: () => number
}) {
  const [html, setHtml] = useState("")
  const htmlRef = useRef("")

  useEffect(() => {
    if (cues.length === 0) {
      htmlRef.current = ""
      setHtml("")
      return
    }
    let raf = 0
    const tick = () => {
      const next = activeCueHtml(cues, getTime())
      if (next !== htmlRef.current) {
        htmlRef.current = next
        setHtml(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cues, getTime])

  if (!html) return null
  return (
    <div
      // Fixed low position — clear of the control bar's height — so subtitles
      // never shift when the chrome shows or hides.
      className="pointer-events-none absolute inset-x-0 bottom-[8%] z-10 flex justify-center px-[5%]"
    >
      <p
        className="max-w-[46rem] text-balance text-center font-semibold leading-tight tracking-[0.01em] text-white [text-shadow:0_0_4px_rgba(0,0,0,0.75),0_2px_6px_rgba(0,0,0,0.95)] [-webkit-text-stroke:0.5px_rgba(0,0,0,0.55)] text-[clamp(1rem,3.4vw,1.85rem)] [&_i]:italic [&_b]:font-bold"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

interface LocalVideoPlayerProps {
  src: string
  title: string
  nextEpisode?: Movie | null
  // The episode before this one — with nextEpisode, drives the fullscreen
  // previous/next buttons in the control bar. Both play through onPlayNext.
  previousEpisode?: Movie | null
  onPlayNext?: (movie: Movie) => void
  // The movie/episode currently playing — feeds the "paused for a while" info
  // card (title, season/episode, synopsis, rating…) shown over the frozen frame.
  media?: Movie | null
  // Identity for "Continue Watching": contentId is this exact movie/episode's
  // own id (what progress is saved and resumed against); seriesId is the
  // parent show's id, set only when playing an episode, so every episode of
  // one series collapses into a single home-page card.
  contentId?: string
  seriesId?: string
  // Key the remembered audio-language / subtitle choice lives under — the series
  // id for an episode, the movie id otherwise — so every episode reuses it.
  prefsKey?: string
}

export default function LocalVideoPlayer({
  src,
  title,
  nextEpisode = null,
  previousEpisode = null,
  onPlayNext,
  media = null,
  contentId,
  seriesId,
  prefsKey,
}: LocalVideoPlayerProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const assContainerRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const lastProgressSaveAtRef = useRef(0)
  // "Does the user want playback right now" — the intent, decoupled from the
  // <video> element's own paused state (which a hidden/throttled tab flips on its
  // own). useMediaSync keys off this so a browser-imposed video pause never
  // silences the audio. See media-sync.ts.
  const intentPlayingRef = useRef(false)

  const relPath = useMemo(() => {
    if (!src.startsWith(VIDEO_API_PREFIX)) return null
    return decodeURIComponent(src.slice(VIDEO_API_PREFIX.length))
  }, [src])

  // Every place this title's audio/subtitle choice is looked up or saved, most
  // specific first: this exact file, the show it belongs to (episodes only), and the
  // old TMDB-id key that earlier versions used — read-only, so past choices survive.
  const prefsKeys = useMemo(
    () => [relPath ? fileKey(relPath) : null, relPath && seriesId ? showKey(relPath) : null, prefsKey, GLOBAL_PREFS_KEY],
    [relPath, seriesId, prefsKey]
  )

  const [info, setInfo] = useState<VideoInfo | null>(null)
  // Remux mode (see the header): containers browsers can't open, or a native <video>
  // that errored out and needs the ffmpeg pipeline as a fallback.
  const [nativeFailed, setNativeFailed] = useState(false)
  const remuxMode = Boolean(relPath) && (nativeFailed || NON_NATIVE_FILE_RE.test(relPath || "") || Boolean(info?.remux))
  const remuxRef = useRef<RemuxStream | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  // True once the saved audio/subtitle choice has been read and applied — remux mode
  // waits for it so the first stream starts on the right audio track.
  const [prefsResolved, setPrefsResolved] = useState(false)
  const [selectedAudio, setSelectedAudio] = useState(0)
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [buffering, setBuffering] = useState(false)
  const [showPauseInfo, setShowPauseInfo] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  // Starts from the document: the previous episode's player may have left the page in
  // fullscreen (the host stays — see fullscreenTarget), and this one carries on in it.
  const [nativeFullscreen, setNativeFullscreen] = useState(
    () => typeof document !== "undefined" &&
      Boolean(document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement)
  )
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false)
  const fullscreen = nativeFullscreen || pseudoFullscreen
  const [showControls, setShowControls] = useState(true)
  const [hoverPreview, setHoverPreview] = useState<{ x: number; clampedX: number; time: number } | null>(null)
  const [hoverThumbSrc, setHoverThumbSrc] = useState<string | null>(null)
  const playingRef = useRef(false)
  const activityTimerRef = useRef<number | null>(null)
  // How the player is being driven. Touch changes what a tap on the picture means: it
  // shows/hides the controls instead of pausing (see handleSurfaceTap). Starts from
  // the device's primary pointer, then follows whatever was actually used last.
  const [touchUI, setTouchUI] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true
  )
  const touchUIRef = useRef(touchUI)
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 })
  // Touch hold-to-scrub in progress (see startScrub): which way, and how fast.
  const [scrub, setScrub] = useState<{ direction: 1 | -1; speed: number } | null>(null)
  const scrubbing = scrub !== null
  const hoverThumbTimerRef = useRef<number | null>(null)
  const hoverThumbBucketRef = useRef<number | null>(null)
  const hoverThumbGenerationRef = useRef(0)
  // While the tab is hidden — and for a short grace period after it comes back —
  // Chromium throttles the muted <video>'s decode and fires spurious
  // `pause`/`waiting` on it even though the audio never stopped. Those must not
  // flip the UI into "paused" or show the buffering spinner: nothing is actually
  // loading, playback continues. `null` = not in a background lull.
  const bgGraceUntilRef = useRef<number | null>(null)
  const isBackgroundStall = useCallback(
    () => document.hidden || (bgGraceUntilRef.current !== null && Date.now() < bgGraceUntilRef.current),
    []
  )

  const [debugSync] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("flick:debug-sync") === "1"
  )

  useEffect(() => {
    if (!relPath) return
    let cancelled = false
    fetch(`/api/local-video-info?path=${encodeURIComponent(relPath)}`)
      .then((res) => res.json())
      .then((data: VideoInfo) => {
        if (cancelled) return
        setInfo(data)
        // Warm the whole scrub-bar thumbnail track now, while the episode is
        // still loading — by the time anyone actually hovers the seek bar,
        // most (often all) frames are already cached and load instantly.
        // Fire-and-forget: the server runs this in the background and we
        // don't need its result, just to have kicked it off early.
        if (data.duration > 0) {
          fetch(`${THUMBNAIL_PREGEN_API_PREFIX}${encodeURIComponent(relPath)}?duration=${data.duration}`).catch(() => {})
        }
      })
      .catch(() => {
        // No track list to apply prefs to — don't hold playback back waiting for
        // one; it starts on the first audio track.
        if (!cancelled) setPrefsResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [relPath])

  const duration = info?.duration || videoRef.current?.duration || 0

  // ---- Audio track: separate element kept in lockstep with the video (master clock) ----
  const audioOffsetRef = useRef(0) // absolute movie time the *current* audio stream's t=0 maps to
  const audioGenerationRef = useRef(0) // race guard: only the latest reload may apply once ready
  const audioInitializedRef = useRef(false)
  // True while a touch hold-to-scrub owns the playhead (and a moment after, until its
  // last seek lands): the seek handling below leaves the audio alone meanwhile, since
  // reloading the stream on each of those many small steps would be pointless — the
  // scrub reloads it once, where it ends.
  const scrubGuardRef = useRef(false)
  const selectedAudioRef = useRef(selectedAudio)
  useEffect(() => {
    selectedAudioRef.current = selectedAudio
  }, [selectedAudio])
  const selectedSubtitleRef = useRef(selectedSubtitle)
  useEffect(() => {
    selectedSubtitleRef.current = selectedSubtitle
  }, [selectedSubtitle])
  const audioOptionsRef = useRef<Track[]>([])
  useEffect(() => {
    audioOptionsRef.current = info?.audioTracks || []
  }, [info])

  // ---- Why a track could look selected and play nothing ----
  // Sound lives in its own <audio>, next to a MUTED <video> that is only the clock.
  // Browsers let a muted video autoplay but refuse audible playback without a user
  // gesture (a page reload, or a play() that runs after an async wait — the saved
  // track being applied once the prefs had loaded). That refusal is a rejected
  // play() promise, and every call used to swallow it: the picture rolled on, the
  // menu showed the track as selected, and the audio element sat paused. Picking a
  // track again "fixed" it only because that click is a user gesture.
  // Now: playback waits for the saved track before starting (one load, the right
  // track — no hop from a default track), every audio.play() goes through
  // playAudio(), and a refusal pauses everything and asks for a click instead of
  // letting the video run silently.
  const [audioIssue, setAudioIssue] = useState<null | "blocked" | "failed">(null)

  const handleAudioPlayRejected = useCallback((error: unknown) => {
    // AbortError = the src was replaced mid-start (a track switch or seek reload):
    // expected, the new load starts its own play.
    if ((error as DOMException | null)?.name !== "NotAllowedError") return
    intentPlayingRef.current = false
    videoRef.current?.pause()
    setPlaying(false)
    setAudioIssue("blocked")
  }, [])

  const playAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio
      .play()
      .then(() => setAudioIssue((issue) => (issue === "blocked" ? null : issue)))
      .catch(handleAudioPlayRejected)
  }, [handleAudioPlayRejected])

  // Loads `trackIndex` from `absoluteSeconds`. A transcode can fail on the first
  // attempt (a transient ffmpeg hiccup) or for good (a codec the server can't
  // decode): retry the same track once, then try each OTHER track once — tracked
  // in `tried`, so two broken tracks can't bounce between each other forever. The
  // menu always shows the track actually loaded. If none works, say so.
  const reloadAudio = useCallback((
    absoluteSeconds: number,
    trackIndex: number,
    attempt: { retried: boolean; tried: Set<number> } = { retried: false, tried: new Set() }
  ) => {
    const audio = audioRef.current
    if (!audio || !relPath) return
    const generation = ++audioGenerationRef.current
    attempt.tried.add(trackIndex)
    selectedAudioRef.current = trackIndex
    setSelectedAudio(trackIndex)
    audio.pause()
    const start = Math.max(0, absoluteSeconds)
    audio.src = `/api/local-audio/${encodeURIComponent(relPath)}?track=${trackIndex}&start=${start.toFixed(3)}`
    audio.load()
    const onReady = () => {
      if (audioGenerationRef.current !== generation) return // a newer switch/seek already won
      audio.removeEventListener("error", onError)
      audioOffsetRef.current = start
      setAudioIssue((issue) => (issue === "failed" ? null : issue))
      const video = videoRef.current
      // Mid-seek, this stream is about to be moved or replaced: playing it now would
      // be heard from the wrong place. "seeked" starts it (see the seek handling below).
      if (video && !video.paused && !video.seeking) playAudio()
    }
    const onError = () => {
      if (audioGenerationRef.current !== generation) return
      audio.removeEventListener("canplay", onReady)
      if (!attempt.retried) {
        window.setTimeout(() => {
          if (audioGenerationRef.current === generation) {
            reloadAudio(absoluteSeconds, trackIndex, { retried: true, tried: attempt.tried })
          }
        }, 500)
        return
      }
      const fallback = audioOptionsRef.current.find((track) => !attempt.tried.has(track.index))
      if (fallback) {
        reloadAudio(absoluteSeconds, fallback.index, { retried: false, tried: attempt.tried })
        return
      }
      // A real decode/transcode failure on every track — not a selection problem.
      setAudioIssue("failed")
    }
    audio.addEventListener("canplay", onReady, { once: true })
    audio.addEventListener("error", onError, { once: true })
  }, [relPath, playAudio])

  // A seek only needs a brand-new transcode when it lands outside what the audio
  // element already holds. Inside it, the element seeks natively and instantly — and
  // "inside it" covers most seeks in practice: the transcoded track is a few hundred
  // kbps, so the browser buffers minutes of it ahead of the playhead, and the stream
  // keeps everything since its own start behind. Refetching instead costs an ffmpeg
  // spawn plus a real seek on the source file (these live on an external drive), and
  // that wait, plus the pause that preceded it, is the silence after skipping.
  //
  // Returns whether the jump was absorbed. The audio stream's origin is unchanged, so
  // audioOffsetRef still maps its clock to movie time.
  const seekAudioWithinBuffer = useCallback((absoluteSeconds: number): boolean => {
    const audio = audioRef.current
    if (!audio || !audioInitializedRef.current || audio.readyState < 2) return false
    const relative = absoluteSeconds - audioOffsetRef.current
    if (!Number.isFinite(relative) || relative < 0) return false
    const ranges = audio.buffered
    for (let i = 0; i < ranges.length; i++) {
      if (relative >= ranges.start(i) && relative <= ranges.end(i) - AUDIO_BUFFER_SEEK_MARGIN_S) {
        try {
          audio.currentTime = relative
        } catch {
          return false
        }
        // /api/local-audio is a progressive ADTS stream with no Range support, so the
        // element can report an empty `seekable` and silently clamp the assignment
        // instead of honouring it. Reporting the jump as absorbed when that happens
        // would skip the refetch and strand the audio somewhere else entirely — far
        // worse than the silence. Only claim it when it actually landed.
        return Math.abs(audio.currentTime - relative) <= AUDIO_BUFFER_SEEK_MARGIN_S
      }
    }
    return false
  }, [])

  useMediaSync(videoRef, audioRef, audioOffsetRef, intentPlayingRef, !remuxMode, debugSync, handleAudioPlayRejected)

  // Any real seek — scrub bar, chapter jump, anything that moves video.currentTime —
  // has to move the audio with it. This is a native listener on the video element
  // itself (not tied to our own UI handlers) so it covers every way currentTime can
  // change, per the "don't special-case one interaction" brief.
  //
  // Two paths, and which one runs is what the viewer hears. If the target is already
  // inside the current audio stream's buffer — a skip button, a short scrub, anything
  // that doesn't leave the downloaded window — the element is seeked natively and the
  // sound never stops. Only a jump beyond it falls back to fetching a fresh transcode,
  // which does cost a moment of silence.
  //
  // media-sync's own visibilitychange handling also nudges video.currentTime — to
  // snap the video (which a hidden tab can get browser-paused, see useMediaSync) back
  // in step with the audio, which never stopped. That's a currentTime change too, so
  // it lands here as a "seek" — but it's already landing right where the audio
  // already is, and pausing + fetching a whole new transcoded stream for it would
  // itself be the audible pause/resume glitch it's trying to avoid. So: only treat a
  // jump as a real seek — worth pausing audio and reloading its stream — once it's
  // further from where the audio currently is than ordinary drift ever gets.
  useEffect(() => {
    const video = videoRef.current
    if (!video || remuxMode) return
    let debounceId: number | null = null
    const isRealSeek = () => {
      const audio = audioRef.current
      if (!audio) return true
      const audioAbsolute = audioOffsetRef.current + audio.currentTime
      return Math.abs(video.currentTime - audioAbsolute) >= SEEK_RELOAD_MIN_JUMP_S
    }
    // Moves the audio to the new position using the stream it already has, and keeps it
    // playing. Done on `seeking` rather than `seeked` so sound never stops at all: the
    // video's own seek on a byte-range-served local file takes a few tens of ms, far
    // under the drift media-sync would even react to.
    const absorbSeek = () => {
      if (!seekAudioWithinBuffer(video.currentTime)) return false
      if (!video.paused) playAudio()
      return true
    }
    const onSeeking = () => {
      if (scrubGuardRef.current) return
      if (!isRealSeek()) return
      // Absorbed: the audio is already at the target, so isRealSeek() reads false in
      // `seeked` and no reload is scheduled. Only a jump out of the buffered stream
      // still has to go silent while a new transcode is fetched.
      if (absorbSeek()) return
      audioRef.current?.pause()
    }
    const onSeeked = () => {
      if (scrubGuardRef.current) return
      if (!isRealSeek()) return
      // Retry here too: more of the stream may have arrived during the seek itself,
      // and a scrub that ends inside the buffer shouldn't pay for a refetch.
      if (absorbSeek()) return
      if (debounceId !== null) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        if (!audioInitializedRef.current) return
        reloadAudio(video.currentTime, selectedAudioRef.current)
      }, SEEK_RELOAD_DEBOUNCE_MS)
    }
    video.addEventListener("seeking", onSeeking)
    video.addEventListener("seeked", onSeeked)
    return () => {
      video.removeEventListener("seeking", onSeeking)
      video.removeEventListener("seeked", onSeeked)
      if (debounceId !== null) window.clearTimeout(debounceId)
    }
  }, [reloadAudio, seekAudioWithinBuffer, remuxMode, playAudio])

  // Watchdog for the audio stream itself: after a large seek, or if the ffmpeg
  // transcode falls behind / dies partway through (the file lives on an external
  // drive, so a big jump means a real disk seek), the <audio> element can stall or
  // end early while the <video> (a plain static file) keeps playing fine. Nothing
  // else would ever notice, so the movie would just go silent for good. If the
  // audio stalls or ends while the video is still playing, request a fresh stream
  // from the current position.
  //
  // A hidden tab (switched away from, not just minimized/on another virtual desktop —
  // those don't flip document.hidden, only actually occluding the tab does) fires
  // spurious "stalled"/"ended" events on perfectly healthy audio that never stopped
  // playing. So:
  //   - While hidden: ignore audio stalls completely — never touch the stream.
  //   - On return: do NOT proactively reload (that pause + refetch IS the
  //     pause/resume glitch). If the audio is genuinely dead, a fresh event fires
  //     now that we're visible and the liveness check below handles it.
  //   - Before any reload: confirm the audio really isn't advancing — reloading
  //     healthy audio is exactly what we're trying to avoid.
  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio || remuxMode) return
    let recoverTimer: number | null = null
    // Give the audio element a moment to settle after the tab becomes visible
    // before trusting any "not advancing" reading — the visibility transition
    // itself can make Chromium briefly misreport currentTime/paused.
    let settleUntil = 0

    const attemptRecover = () => {
      if (!audioInitializedRef.current || video.paused || video.seeking || document.hidden) return
      if (performance.now() < settleUntil) return
      const before = audio.currentTime
      window.setTimeout(() => {
        if (!audioInitializedRef.current || video.paused || video.seeking || document.hidden) return
        const stillAdvancing = audio.currentTime - before > 0.15
        if (stillAdvancing && !audio.paused && !audio.ended) return
        reloadAudio(video.currentTime, selectedAudioRef.current)
      }, 500)
    }
    const scheduleRecover = () => {
      if (recoverTimer !== null || document.hidden) return
      recoverTimer = window.setTimeout(() => {
        recoverTimer = null
        attemptRecover()
      }, 800)
    }
    const cancelRecover = () => {
      if (recoverTimer !== null) {
        window.clearTimeout(recoverTimer)
        recoverTimer = null
      }
    }
    const onStalled = () => scheduleRecover()
    const onAudioEnded = () => scheduleRecover()
    const onAudioPlaying = () => cancelRecover()
    const onVisibilityChange = () => {
      if (!document.hidden) {
        settleUntil = performance.now() + 1500
        cancelRecover()
      }
    }
    audio.addEventListener("stalled", onStalled)
    audio.addEventListener("ended", onAudioEnded)
    audio.addEventListener("playing", onAudioPlaying)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelRecover()
      audio.removeEventListener("stalled", onStalled)
      audio.removeEventListener("ended", onAudioEnded)
      audio.removeEventListener("playing", onAudioPlaying)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [reloadAudio, remuxMode])

  // Persist the current audio / subtitle pick against this title (see media-prefs.ts):
  // stored under the file itself so it stays with this movie, and — for an episode —
  // under its show, so later episodes start the same way.
  const persistPrefs = useCallback((audioIdx: number, subtitleIdx: number | null) => {
    if (!info) return
    const audio = info.audioTracks.find((track) => track.index === audioIdx)
    const subtitle = subtitleIdx === null
      ? null
      : info.subtitleTracks.find((track) => track.index === subtitleIdx) || null
    // File, show (episodes) and the global "last choice" that titles without one of
    // their own start from. Only explicit picks get here — never an automatic
    // fallback (see reloadAudio), so a track that failed once doesn't become the
    // saved preference.
    saveMediaPrefs([prefsKeys[0], prefsKeys[1], GLOBAL_PREFS_KEY], {
      audioLanguage: audio?.language || null,
      audioTitle: audio?.title || null,
      audioIndex: audio ? audioIdx : null,
      audioCodec: audio?.codec || null,
      subtitleOff: subtitle === null,
      subtitleLanguage: subtitle?.language || null,
      subtitleTitle: subtitle?.title || null,
      subtitleForced: Boolean(subtitle?.forced),
      subtitleIndex: subtitle ? subtitleIdx : null,
      subtitleCodec: subtitle?.codec || null,
    })
  }, [prefsKeys, info])

  const handleAudioChange = useCallback((value: string) => {
    const idx = Number(value)
    setSelectedAudio(idx)
    selectedAudioRef.current = idx
    if (remuxMode) {
      remuxRef.current?.setAudioTrack(idx)
    } else {
      reloadAudio(videoRef.current?.currentTime ?? 0, idx)
    }
    persistPrefs(idx, selectedSubtitleRef.current)
  }, [reloadAudio, persistPrefs, remuxMode])

  const handleSubtitleChange = useCallback((value: string) => {
    const next = value === OFF_VALUE ? null : Number(value)
    setSelectedSubtitle(next)
    selectedSubtitleRef.current = next
    persistPrefs(selectedAudioRef.current, next)
  }, [persistPrefs])

  // Apply the saved audio / subtitle choice once this file's track list is known.
  // Runs a single time per mount; the user's later picks are theirs to keep. The saved
  // choices are read from the server store first (see loadMediaPrefs), which is why
  // this is asynchronous — and why remux mode holds its first stream until
  // `prefsResolved`, so playback opens on the right track rather than hopping to it.
  // In the native two-element mode audio may already be running on the default track;
  // then it's hopped to the resolved one (a brief reload, only if it differs).
  const prefsAppliedRef = useRef(false)
  useEffect(() => {
    if (!info || prefsAppliedRef.current) return
    let cancelled = false
    loadMediaPrefs().then(() => {
      if (cancelled || prefsAppliedRef.current) return
      prefsAppliedRef.current = true
      const prefs = getMediaPrefs(prefsKeys)
      const audioIdx = resolveAudioIndex(info.audioTracks, prefs)
      const subtitleIdx = resolveSubtitleIndex(info.subtitleTracks, prefs)
      const previousAudioIdx = selectedAudioRef.current
      setSelectedAudio(audioIdx)
      selectedAudioRef.current = audioIdx
      setSelectedSubtitle(subtitleIdx)
      selectedSubtitleRef.current = subtitleIdx
      if (audioInitializedRef.current && audioIdx !== previousAudioIdx) {
        reloadAudio(videoRef.current?.currentTime ?? 0, audioIdx)
      }
      setPrefsResolved(true)
    })
    return () => {
      cancelled = true
    }
  }, [info, prefsKeys, reloadAudio])

  // ---- Subtitles: custom styled overlay for plain text (VTT/SRT), JASSUB for ASS/SSA ----
  // Both are driven off getSubtitleTime() — the audio clock the viewer actually
  // hears — not the muted clock-video, so lines land on the dialogue in real time.
  const subtitleOptions = info?.subtitleTracks || []
  const subtitleLabels = useMemo(
    () => buildSubtitleLabels(subtitleOptions, (i) => `${t("player.subtitles")} ${i + 1}`),
    [subtitleOptions, t]
  )
  const selectedSubtitleTrack = subtitleOptions.find((s) => s.index === selectedSubtitle) || null
  const isAssSubtitle = selectedSubtitleTrack?.format === "ass"
  const isPgsSubtitle = selectedSubtitleTrack?.format === "pgs"

  // The clock every subtitle renderer reads. Rules, in order:
  //   1. While a seek is in flight there is no valid time (NaN → no cue matches, nothing
  //      is drawn). `video.currentTime` already holds the target, but the frame on screen
  //      is still the OLD position; a line from the new scene over the old picture is
  //      exactly the "subtitles out of sync after skipping" symptom.
  //   2. Otherwise follow the <audio> the viewer actually hears (native two-element
  //      mode) — but only while it agrees with the video. Right after a jump the audio
  //      element keeps playing the old position until it is paused and reloaded, and
  //      once reloaded it can trail the video by however long the transcode took to
  //      start; a clock that far from the video is stale, not authoritative.
  //   3. Otherwise the video's own time (always the case in remux mode, where the
  //      <video> carries the sound itself).
  const getSubtitleTime = useCallback(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video) return 0
    if (video.seeking) return Number.NaN
    if (
      audio &&
      audioInitializedRef.current &&
      !audio.paused &&
      audio.readyState >= 2 &&
      Number.isFinite(audio.currentTime)
    ) {
      const audioTime = audioOffsetRef.current + audio.currentTime
      if (Math.abs(audioTime - video.currentTime) <= SUBTITLE_CLOCK_TOLERANCE_S) return audioTime
    }
    return video.currentTime
  }, [])

  const vttSubUrl = !isAssSubtitle && !isPgsSubtitle && relPath && selectedSubtitleTrack
    ? `/api/local-subtitle/${encodeURIComponent(relPath)}?stream=${selectedSubtitleTrack.index}`
    : null
  const parsedCues = useParsedSubtitles(vttSubUrl)

  // Blu-ray bitmap subtitles: fetched as a raw .sup and drawn by PgsSubtitleView.
  const pgsSubUrl = isPgsSubtitle && relPath && selectedSubtitleTrack
    ? `/api/local-subtitle-pgs/${encodeURIComponent(relPath)}?stream=${selectedSubtitleTrack.index}`
    : null
  const pgsCuesRef = usePgsSubtitles(pgsSubUrl)

  const assSubUrl = isAssSubtitle && relPath && selectedSubtitleTrack
    ? `/api/local-subtitle-raw/${encodeURIComponent(relPath)}?stream=${selectedSubtitleTrack.index}`
    : null
  const fontUrls = useMemo(
    () => relPath
      ? (info?.fonts || []).map((f) => `/api/local-font/${encodeURIComponent(relPath)}?attachment=${f.index}&filename=${encodeURIComponent(f.filename)}`)
      : [],
    [info, relPath]
  )
  useAssSubtitle(videoRef, assContainerRef, assSubUrl, fontUrls)

  // ---- Opening / ending markers (series & anime only) ----
  // Intervals come from src/config/episode-markers.json (see episode-markers.ts) —
  // matched by TMDB id or by any name the show goes by here: its folder on disk, its
  // TMDB title, its original title. Movies never get any.
  const isEpisodeMedia = Boolean(media?.episodeNumber) && media?.type !== "movie"
  const markers = useMemo(() => {
    if (!isEpisodeMedia || !media) return { opening: null, ending: null }
    const folders = relPath ? relPath.split(/[\\/]/).slice(0, -1) : []
    return resolveEpisodeMarkers(
      {
        titles: [media.seriesTitle || "", media.originalTitle || "", ...folders],
        tmdbId: media.tmdbId,
        season: media.seasonNumber || 1,
        episode: media.episodeNumber || 0,
      },
      duration
    )
  }, [isEpisodeMedia, media, relPath, duration])

  // Inside [start, end). An interval reaching the end of the file stays "inside" at
  // the very end too, so a card shown over the last seconds is still there once
  // playback stops on the final frame.
  const isWithin = (interval: MarkerInterval | null, time: number) =>
    Boolean(interval) &&
    time >= interval!.start &&
    (time < interval!.end || (duration > 0 && interval!.end >= duration - 1 && time <= duration))

  // "Skip intro": visible for exactly the configured opening, whether playback got
  // there on its own or by a seek (both update currentTime). The last half second is
  // left out — skipping then would be a no-op jump.
  const showSkipIntro = Boolean(markers.opening) && isWithin(markers.opening, currentTime) &&
    currentTime < markers.opening!.end - 0.5

  // "Skip ending": only for episodes with a post-credits scene the config locates.
  // Shown over the ending, before the scene starts; jumps straight to the scene (the
  // next-episode card then waits for the scene to finish — see nextPlan).
  const postCreditsScene = markers.postCreditsScene ?? null
  const showSkipEnding = Boolean(postCreditsScene) && Boolean(markers.ending) &&
    isWithin(markers.ending, currentTime) && currentTime < postCreditsScene!.start - 0.5

  // One floating "skip" button; intro and ending never overlap.
  const skipAction = showSkipIntro
    ? { label: t("player.skipIntro"), to: markers.opening!.end }
    : showSkipEnding
      ? { label: t("player.skipEnding"), to: postCreditsScene!.start }
      : null

  // ---- Next episode card ----
  // Where it shows and whether it counts down, from the most to the least reliable
  // source:
  //   1. The markers config: the ending's interval (or `nextCardAt`), and the
  //      episode's `postCredits` / `autoplay` / `countdown` settings.
  //   2. The file's own chapter for the ending ("Credits", "Ending", "ED"…). A
  //      chapter AFTER it means there's more of the episode (post-credits scene,
  //      preview) — treated as post-credits unless the config says otherwise.
  //   3. A guess (a short last chapter, or the closing seconds): the card shows, but
  //      only counts down if the config explicitly enables autoplay — a guess must
  //      never cut a scene off.
  // A countdown only ever runs when nothing worth watching is left: no post-credits
  // content, or — when the config locates the scene — once that scene is over (the
  // card then appears at its end, never over it). Otherwise the card is just a
  // shortcut and the episode plays to its last frame.
  const nextPlan = useMemo(() => {
    if (duration <= 0) return null
    const countdown = markers.countdown ?? NEXT_COUNTDOWN_DEFAULT_S
    const plan = (interval: MarkerInterval, postCreditsDefault: boolean, autoplayDefault: boolean) => {
      const start = markers.nextCardAt ?? interval.start
      const postCredits = markers.postCredits ?? postCreditsDefault
      return {
        interval: { start, end: Math.max(interval.end, start + 1) },
        postCredits,
        autoplay: !postCredits && (markers.autoplay ?? autoplayDefault),
        countdown,
      }
    }
    if (postCreditsScene) {
      const start = markers.nextCardAt ?? postCreditsScene.end
      // Only the closing logos / dub credits after the scene: safe to count down —
      // unless the scene runs to the end of the file, where there's nothing to count.
      const tailLeft = duration - postCreditsScene.end >= 1
      return {
        interval: { start, end: Math.max(duration, start + 1) },
        postCredits: true,
        autoplay: tailLeft && (markers.autoplay ?? true),
        countdown,
      }
    }
    if (markers.ending) return plan(markers.ending, false, true)
    const chapters = info?.chapters || []
    const namedIndex = chapters.findIndex((chapter) => /cr[ée]dit|ending|^ed\b/i.test(chapter.title))
    if (namedIndex !== -1) {
      const named = chapters[namedIndex]
      return plan({ start: named.start, end: named.end || duration }, namedIndex < chapters.length - 1, true)
    }
    if (chapters.length >= 2) {
      const last = chapters[chapters.length - 1]
      const lastLength = (last.end || duration) - last.start
      if (lastLength > 0 && lastLength <= Math.min(300, duration * 0.2)) {
        return plan({ start: last.start, end: duration }, false, false)
      }
    }
    return plan({ start: Math.max(0, duration - CREDITS_FALLBACK_LAST_S), end: duration }, false, false)
  }, [markers, postCreditsScene, info, duration])

  // The last frame counts too: after a post-credits scene (outside the ending's
  // interval) the episode stops with the card up, so the next one is a click away.
  const atEnd = duration > 0 && currentTime >= duration - 0.5
  const insideEnding = Boolean(nextPlan) && (isWithin(nextPlan!.interval, currentTime) || atEnd)

  // Closing the card hides it (and cancels its countdown) for this pass through the
  // ending only: leave the interval — seek back before it — and it comes back the next
  // time playback enters it. Reset during render (React's pattern for state derived
  // from a changing input) rather than in an effect.
  const [nextDismissed, setNextDismissed] = useState(false)
  if (nextDismissed && !insideEnding) setNextDismissed(false)

  // Only when a real next episode exists (PlayerPage passes null after the last
  // one) — never a card, or a countdown, that leads nowhere.
  const showNextCard = Boolean(nextEpisode) && insideEnding && !nextDismissed
  const countdownActive = showNextCard && Boolean(nextPlan?.autoplay)

  // Countdown in seconds of PLAYBACK: it only advances while the episode plays, so
  // pausing pauses it; leaving the ending (seeking back) or closing the card resets it.
  const [countdownElapsed, setCountdownElapsed] = useState(0)
  if (!countdownActive && countdownElapsed !== 0) setCountdownElapsed(0)
  useEffect(() => {
    if (!countdownActive || !playing) return
    const id = window.setInterval(() => setCountdownElapsed((elapsed) => elapsed + COUNTDOWN_TICK_S), COUNTDOWN_TICK_S * 1000)
    return () => window.clearInterval(id)
  }, [countdownActive, playing])
  const countdownTotal = nextPlan?.countdown ?? NEXT_COUNTDOWN_DEFAULT_S
  const countdownRemaining = Math.max(0, countdownTotal - countdownElapsed)

  const dismissNextEpisode = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    setNextDismissed(true)
  }, [])

  const playNextNow = useCallback(() => {
    if (nextEpisode) onPlayNext?.(nextEpisode)
  }, [nextEpisode, onPlayNext])

  // Countdown finished → load and play the next episode.
  useEffect(() => {
    if (countdownActive && countdownRemaining <= 0 && nextEpisode) onPlayNext?.(nextEpisode)
  }, [countdownActive, countdownRemaining, nextEpisode, onPlayNext])

  const handleVideoEnded = useCallback(() => {
    intentPlayingRef.current = false
    if (contentId) clearWatchProgress(contentId)
    // An ending shorter than the countdown: nothing is left to watch, so a running
    // countdown finishes now. Post-credits / no-autoplay episodes just stop here,
    // card up.
    if (countdownActive && nextEpisode) onPlayNext?.(nextEpisode)
  }, [contentId, countdownActive, nextEpisode, onPlayNext])

  const nextEpisodeImage = nextEpisode
    ? backdropUrl(nextEpisode.backdropPath) || posterUrl(nextEpisode.posterPath)
    : null

  // ---- Transport controls ----
  // A probed file with no audio stream at all plays as picture only — that's the
  // file, not a track that failed to load.
  const fileHasNoAudio = Boolean(info && !info.error && info.audioTracks.length === 0)

  const startPlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    intentPlayingRef.current = true
    setAudioIssue((issue) => (issue === "blocked" ? null : issue))
    if (remuxMode) {
      // The <video> carries its own (unmuted) audio here — the same autoplay rule
      // applies to it, so a refusal is handled the same way.
      video.play().catch(handleAudioPlayRejected)
      return
    }
    if (fileHasNoAudio) {
      video.play().catch(() => {})
      return
    }
    if (!audioInitializedRef.current) {
      audioInitializedRef.current = true
      reloadAudio(video.currentTime, selectedAudioRef.current)
    }
    video.play().catch(() => {})
    // Called right here, inside the click that started playback, even when the
    // stream is still loading: that's what lets the browser allow sound on this
    // element (Safari in particular needs the gesture on the element itself).
    playAudio()
  }, [reloadAudio, remuxMode, fileHasNoAudio, playAudio, handleAudioPlayRejected])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) startPlayback()
    else {
      intentPlayingRef.current = false
      video.pause()
    }
  }, [startPlayback])

  // Autoplay on load — the click that got the user here (a movie's "Reproducir"
  // button, from the hero or a hover card) is still within the browser's user
  // activation window when this effect runs right after mount, so starting
  // playback here doesn't get blocked as an unprompted autoplay. If there's a
  // saved "Continue Watching" position for this exact content, seek to it
  // first — setting currentTime before metadata has loaded is unreliable, so
  // this waits for loadedmetadata when the browser hasn't reached it yet.
  //
  // It also waits for `prefsResolved`: the audio track the viewer saved must be the
  // one loaded when sound starts. Starting on a default track and hopping to the
  // saved one once the prefs arrived meant a second play() long after the click —
  // the one the browser refuses, leaving the saved track selected and silent.
  const autoplayDoneRef = useRef(false)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !prefsResolved || autoplayDoneRef.current) return
    const resumeAndPlay = () => {
      if (autoplayDoneRef.current) return
      autoplayDoneRef.current = true
      const saved = contentId ? getWatchProgress(contentId) : null
      if (saved && saved.currentTime > 0) {
        try {
          video.currentTime = saved.currentTime
          setCurrentTime(saved.currentTime)
        } catch {
          // Ignore — playback just starts from 0 instead.
        }
      }
      // Nobody has interacted with this page yet (a reload, a pasted link): the
      // browser would refuse sound. Don't start a silent picture — show the play
      // button and say why; that click starts picture and sound together.
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
      if (activation && !activation.hasBeenActive && !fileHasNoAudio) {
        setAudioIssue("blocked")
        return
      }
      startPlayback()
    }
    if (video.readyState >= 1) {
      resumeAndPlay()
      return
    }
    video.addEventListener("loadedmetadata", resumeAndPlay, { once: true })
    return () => video.removeEventListener("loadedmetadata", resumeAndPlay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, prefsResolved])

  // Stored with every resume point so a "Continue Watching" card can label which episode
  // it will resume, instead of decoding it back out of the content id. Not memoized: it
  // is only ever passed into a call, never used as a dependency, and PlayerPage remounts
  // this component per episode (key={trailerUrl}) so `media` cannot change under it.
  const episodeRef =
    media?.episodeNumber != null
      ? { season: media.seasonNumber, episode: media.episodeNumber }
      : undefined

  // Persist "Continue Watching" progress when leaving this episode/movie —
  // navigating back, switching episodes (this component remounts fully on
  // every switch via key={trailerUrl} in PlayerPage), or closing the tab.
  useEffect(() => {
    const saveNow = () => {
      const video = videoRef.current
      if (!video || !contentId) return
      saveWatchProgress(contentId, video.currentTime, video.duration || duration, seriesId, episodeRef)
    }
    window.addEventListener("beforeunload", saveNow)
    return () => {
      window.removeEventListener("beforeunload", saveNow)
      saveNow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, seriesId])

  // Remux mode: attach the MediaSource stream once the track list (duration, container
  // start offset) and the saved audio choice are known, opening straight at the
  // "Continue Watching" position so there's no wasted stream from 0:00.
  //
  // Declared AFTER the progress-saving effect on purpose: on unmount React runs
  // cleanups in declaration order, and destroy() resets the element's currentTime,
  // which would otherwise be what got saved.
  useEffect(() => {
    const video = videoRef.current
    if (!remuxMode || !video || !relPath || !info || !prefsResolved) return
    const stream = new RemuxStream(video, {
      relPath,
      duration: info.duration,
      startTime: info.startTime || 0,
      onError: (message) => setStreamError(message),
    })
    remuxRef.current = stream
    setStreamError(null)
    const saved = contentId ? getWatchProgress(contentId) : null
    stream.start(saved && saved.currentTime > 0 ? saved.currentTime : 0, selectedAudioRef.current)
    return () => {
      stream.destroy()
      remuxRef.current = null
    }
    // contentId is read once at attach time; a different title remounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remuxMode, relPath, info, prefsResolved])

  // Scrub-bar hover preview: debounced so we don't hit the server for every
  // pixel the pointer crosses, and bucketed so nearby positions reuse the same
  // cached frame. A generation guard drops a stale response that resolves after
  // the pointer has already moved to a different spot.
  const scheduleThumbnailFetch = useCallback((hoverSeconds: number) => {
    if (!relPath) return
    // Match the server's pregeneration grid exactly (once known) so a hover
    // lands on an already-warmed frame instead of a bucket nothing produced.
    const bucketSize = info?.thumbnailInterval || THUMBNAIL_BUCKET_FALLBACK_S
    const bucket = Math.max(0, Math.round(hoverSeconds / bucketSize) * bucketSize)
    if (hoverThumbBucketRef.current === bucket) return
    // The very first position of a hover session fetches immediately (no
    // debounce) so the preview feels instant on a quick tap-and-look; only
    // continued movement across buckets — actual scrubbing — gets debounced,
    // so dragging quickly doesn't fire a request per bucket crossed.
    const isFirstInSession = hoverThumbBucketRef.current === null
    hoverThumbBucketRef.current = bucket
    if (hoverThumbTimerRef.current !== null) window.clearTimeout(hoverThumbTimerRef.current)
    const fetchThumbnail = () => {
      const generation = ++hoverThumbGenerationRef.current
      const img = new Image()
      img.onload = () => {
        if (hoverThumbGenerationRef.current === generation) setHoverThumbSrc(img.src)
      }
      img.src = `${THUMBNAIL_API_PREFIX}${encodeURIComponent(relPath)}?t=${bucket}`
    }
    if (isFirstInSession) {
      fetchThumbnail()
    } else {
      hoverThumbTimerRef.current = window.setTimeout(fetchThumbnail, THUMBNAIL_DEBOUNCE_MS)
    }
  }, [relPath, info?.thumbnailInterval])

  const clearThumbnailPreview = useCallback(() => {
    if (hoverThumbTimerRef.current !== null) window.clearTimeout(hoverThumbTimerRef.current)
    hoverThumbBucketRef.current = null
    hoverThumbGenerationRef.current++
    setHoverThumbSrc(null)
  }, [])

  useEffect(() => () => {
    if (hoverThumbTimerRef.current !== null) window.clearTimeout(hoverThumbTimerRef.current)
  }, [])

  const seekTo = useCallback((absoluteSeconds: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.max(0, Math.min(duration || absoluteSeconds, absoluteSeconds))
    video.currentTime = clamped
    setCurrentTime(clamped)
  }, [duration])

  const skip = useCallback((delta: number) => {
    const video = videoRef.current
    if (!video) return
    seekTo(video.currentTime + delta)
  }, [seekTo])

  // Media Session — the same thing real streaming platforms register: it tells the OS
  // and the browser this tab is doing genuine, ongoing media playback (lock-screen/
  // media-key controls are the visible bonus). More importantly, a page with an active
  // "playing" session is one of the few things that reliably keeps Chromium from
  // aggressively suspending frame decode on this element once the tab is hidden — a
  // muted <video> with nothing else marking it as "real" playback is exactly what that
  // suspension targets, and it's what caused the multi-second catch-up stutter when
  // coming back to a backgrounded tab.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title })
    navigator.mediaSession.setActionHandler("play", () => startPlayback())
    navigator.mediaSession.setActionHandler("pause", () => {
      intentPlayingRef.current = false
      videoRef.current?.pause()
    })
    navigator.mediaSession.setActionHandler("seekbackward", () => skip(-SKIP_SECONDS))
    navigator.mediaSession.setActionHandler("seekforward", () => skip(SKIP_SECONDS))
    navigator.mediaSession.setActionHandler("nexttrack", nextEpisode ? () => onPlayNext?.(nextEpisode) : null)
    navigator.mediaSession.setActionHandler("previoustrack", previousEpisode ? () => onPlayNext?.(previousEpisode) : null)
    return () => {
      navigator.mediaSession.setActionHandler("play", null)
      navigator.mediaSession.setActionHandler("pause", null)
      navigator.mediaSession.setActionHandler("seekbackward", null)
      navigator.mediaSession.setActionHandler("seekforward", null)
      navigator.mediaSession.setActionHandler("nexttrack", null)
      navigator.mediaSession.setActionHandler("previoustrack", null)
    }
  }, [title, startPlayback, skip, nextEpisode, previousEpisode, onPlayNext])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.playbackState = playing ? "playing" : "paused"
  }, [playing])

  // The element that actually makes sound: the <video> in remux mode, the separate
  // hidden <audio> otherwise (where the <video> stays muted as a silent clock).
  const soundElement = useCallback(
    (): HTMLMediaElement | null => (remuxMode ? videoRef.current : audioRef.current),
    [remuxMode]
  )

  const toggleMute = useCallback(() => {
    const sound = soundElement()
    if (!sound) return
    sound.muted = !sound.muted
    setMuted(sound.muted)
  }, [soundElement])

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const sound = soundElement()
    const next = Number(event.target.value)
    setVolume(next)
    if (sound) {
      sound.volume = next
      sound.muted = next === 0
      setMuted(next === 0)
    }
  }, [soundElement])

  const handleRateChange = useCallback((value: string) => {
    const next = Number(value)
    setRate(next)
    const video = videoRef.current
    if (video) video.playbackRate = next // useMediaSync propagates this to the audio element
  }, [])

  // Fullscreen is always the player CONTAINER, never the <video>: the subtitle canvas,
  // the "Skip intro" button and the next-episode card are siblings of the video, and
  // anything that fullscreens the bare video element (iOS's native player) leaves
  // them all behind. Safari on iPad only has the prefixed API; iPhone has none for
  // arbitrary elements — there the container is pinned over the whole viewport
  // instead ("pseudo" fullscreen), which keeps every overlay visible.
  // What goes fullscreen: the page's stable player slot (data-fullscreen-host), not
  // this component's own element. This one is replaced on every episode, and removing
  // the fullscreen element drops the browser out of fullscreen — so "next episode"
  // would always leave it. The host survives the switch. Standalone (no host), the
  // player's own element.
  const fullscreenTarget = useCallback(
    () => containerRef.current?.closest<HTMLElement>("[data-fullscreen-host]") ?? containerRef.current,
    []
  )

  // The iPhone-style "pseudo" fullscreen is this component's own state, so it's
  // mirrored on the host too: the next episode's player picks it up from there.
  const pseudoWasOnRef = useRef(false)
  useEffect(() => {
    if (fullscreenTarget()?.dataset.pseudoFullscreen === "1") setPseudoFullscreen(true)
  }, [fullscreenTarget])
  useEffect(() => {
    const host = fullscreenTarget()
    if (!host) return
    if (pseudoFullscreen) host.dataset.pseudoFullscreen = "1"
    // Only an actual exit clears it — not this player's first render (still false
    // while the effect above restores it).
    else if (pseudoWasOnRef.current) delete host.dataset.pseudoFullscreen
    pseudoWasOnRef.current = pseudoFullscreen
  }, [pseudoFullscreen, fullscreenTarget])

  const toggleFullscreen = useCallback(() => {
    const container = fullscreenTarget() as FullscreenCapable | null
    if (!container) return
    const doc = document as FullscreenDocument
    if (pseudoFullscreen) {
      setPseudoFullscreen(false)
      return
    }
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
      else doc.webkitExitFullscreen?.()
      return
    }
    const request = container.requestFullscreen
      ? () => container.requestFullscreen()
      : container.webkitRequestFullscreen
        ? () => Promise.resolve(container.webkitRequestFullscreen?.())
        : null
    if (!request) {
      setPseudoFullscreen(true)
      return
    }
    request()
      .then(() => {
        // Phones: turn to landscape while fullscreen, where the platform allows it.
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        orientation?.lock?.("landscape").catch(() => {})
      })
      .catch(() => setPseudoFullscreen(true))
  }, [pseudoFullscreen, fullscreenTarget])

  useEffect(() => {
    const doc = document as FullscreenDocument
    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement || doc.webkitFullscreenElement)
      setNativeFullscreen(active)
      if (!active) screen.orientation?.unlock?.()
    }
    document.addEventListener("fullscreenchange", onFsChange)
    document.addEventListener("webkitfullscreenchange", onFsChange)
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange)
      document.removeEventListener("webkitfullscreenchange", onFsChange)
    }
  }, [])

  // Escape leaves the pseudo fullscreen too, like it does the real one.
  useEffect(() => {
    if (!pseudoFullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPseudoFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pseudoFullscreen])

  // Keep a grace window open for ~1.5s after the tab becomes visible again, so
  // the trailing throttled `pause`/`waiting` events Chromium delivers right then
  // are still recognised as background noise and don't briefly show the spinner
  // or the paused overlay. Also clear any spinner that slipped through while hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        bgGraceUntilRef.current = Number.POSITIVE_INFINITY
      } else {
        bgGraceUntilRef.current = Date.now() + 1500
        setBuffering(false)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  // ---- Auto-hide controls (Netflix/YouTube-style) while playing and idle ----
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const registerActivity = useCallback(() => {
    setShowControls(true)
    if (activityTimerRef.current !== null) window.clearTimeout(activityTimerRef.current)
    activityTimerRef.current = window.setTimeout(() => {
      if (playingRef.current) setShowControls(false)
    }, CONTROLS_IDLE_MS)
  }, [])

  useEffect(() => {
    if (playing) registerActivity()
    // A touch hold-to-scrub pauses playback too, but keeps the picture clear.
    else if (!scrubRef.current) setShowControls(true)
  }, [playing, registerActivity])

  const hideControls = useCallback(() => {
    if (activityTimerRef.current !== null) window.clearTimeout(activityTimerRef.current)
    activityTimerRef.current = null
    setShowControls(false)
  }, [])

  const setInputMode = useCallback((touch: boolean) => {
    touchUIRef.current = touch
    setTouchUI(touch)
  }, [])

  // Pointer events, not mouse/touch ones: a tap also fires emulated mouse events
  // (mousemove, click…) right after it, which used to bring the controls straight
  // back after every tap. Only a real mouse moving counts as "mouse activity".
  // ---- Touch: hold to rewind / fast-forward ----
  // Browsers can't play backwards (a negative playbackRate isn't supported), so this
  // doesn't touch the playback rate at all: playback pauses and the playhead is
  // walked along at the current speed, one seek at a time — the next one only once
  // the previous has landed, so a slow disk just means fewer, not queued, frames.
  // Silent while it runs; on release the audio is reloaded once at the new spot and
  // playback resumes if it was playing.
  const holdRef = useRef<{ pointerId: number; x: number; y: number; timer: number } | null>(null)
  const scrubRef = useRef<{
    direction: 1 | -1
    startedAt: number
    last: number
    position: number
    speed: number
    wasPlaying: boolean
    frame: number
  } | null>(null)
  // The click that follows a hold must not also count as a tap on the picture.
  const suppressTapRef = useRef(false)

  const cancelHold = useCallback(() => {
    if (holdRef.current) window.clearTimeout(holdRef.current.timer)
    holdRef.current = null
  }, [])

  const startScrub = useCallback((direction: 1 | -1) => {
    const video = videoRef.current
    if (!video || !(duration > 0)) return
    const wasPlaying = !video.paused
    scrubGuardRef.current = true
    intentPlayingRef.current = false
    video.pause()
    hideControls()
    suppressTapRef.current = true
    const now = performance.now()
    const state = { direction, startedAt: now, last: now, position: video.currentTime, speed: scrubSpeedFor(0), wasPlaying, frame: 0 }
    scrubRef.current = state
    setScrub({ direction, speed: state.speed })
    const end = Math.max(0, duration - SCRUB_END_MARGIN_S)
    const step = (time: number) => {
      if (scrubRef.current !== state) return
      const speed = scrubSpeedFor((time - state.startedAt) / 1000)
      if (speed !== state.speed) {
        state.speed = speed
        setScrub({ direction, speed })
      }
      state.position = Math.min(end, Math.max(0, state.position + direction * speed * ((time - state.last) / 1000)))
      state.last = time
      if (!video.seeking && Math.abs(video.currentTime - state.position) >= 0.04) video.currentTime = state.position
      setCurrentTime(state.position)
      state.frame = requestAnimationFrame(step)
    }
    state.frame = requestAnimationFrame(step)
  }, [duration, hideControls])

  const endScrub = useCallback(() => {
    const state = scrubRef.current
    if (!state) return
    cancelAnimationFrame(state.frame)
    scrubRef.current = null
    setScrub(null)
    const video = videoRef.current
    if (!video) {
      scrubGuardRef.current = false
      return
    }
    if (Math.abs(video.currentTime - state.position) >= 0.04) video.currentTime = state.position
    setCurrentTime(state.position)
    // Keep the seek handling out of it until this last step has landed — it's the
    // scrub's job to move the audio, below.
    if (video.seeking) {
      video.addEventListener("seeked", () => { scrubGuardRef.current = false }, { once: true })
    } else {
      scrubGuardRef.current = false
    }
    if (!remuxMode && audioInitializedRef.current) reloadAudio(state.position, selectedAudioRef.current)
    if (state.wasPlaying) startPlayback()
  }, [remuxMode, reloadAudio, startPlayback])

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const hold = holdRef.current
    if (hold && hold.pointerId === event.pointerId &&
      Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > HOLD_MOVE_TOLERANCE_PX) {
      cancelHold()
    }
    if (event.pointerType !== "mouse") return
    if (touchUIRef.current) setInputMode(false)
    registerActivity()
  }, [registerActivity, setInputMode, cancelHold])

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    const touch = event.pointerType !== "mouse"
    if (touch !== touchUIRef.current) setInputMode(touch)
    suppressTapRef.current = false
    // A touch on an actual control keeps the controls up (and restarts their idle
    // timer); a touch on the picture is handled by handleSurfaceTap on click — or,
    // held long enough, becomes a rewind / fast-forward by side.
    if (!touch) return
    if (!isPlayerSurface(event.target as HTMLElement)) {
      registerActivity()
      return
    }
    const container = containerRef.current
    if (!container || !event.isPrimary) return
    const rect = container.getBoundingClientRect()
    const direction: 1 | -1 = event.clientX < rect.left + rect.width / 2 ? -1 : 1
    cancelHold()
    holdRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        holdRef.current = null
        startScrub(direction)
      }, HOLD_DELAY_MS),
    }
  }, [registerActivity, setInputMode, cancelHold, startScrub])

  const handlePointerEnd = useCallback(() => {
    cancelHold()
    endScrub()
  }, [cancelHold, endScrub])

  // Never leave a scrub running (or the audio guard up) past the player's life.
  useEffect(() => () => {
    if (holdRef.current) window.clearTimeout(holdRef.current.timer)
    if (scrubRef.current) cancelAnimationFrame(scrubRef.current.frame)
  }, [])

  // Player size, for the compact layout (see COMPACT_MAX_*).
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setPlayerSize((size) =>
        Math.round(size.width) === Math.round(width) && Math.round(size.height) === Math.round(height)
          ? size
          : { width, height }
      )
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => {
    if (activityTimerRef.current !== null) window.clearTimeout(activityTimerRef.current)
  }, [])

  // ---- "Paused for a while" info card ----
  // After the video sits paused (not buffering, not on the credits/next card) for
  // PAUSE_INFO_DELAY_MS, fade in a card with the episode/movie details over the
  // frozen frame. Any resume hides it immediately.
  useEffect(() => {
    if (playing || buffering || scrubbing) {
      setShowPauseInfo(false)
      return
    }
    const id = window.setTimeout(() => {
      setShowPauseInfo(true)
      // On touch, controls stay up while paused (nothing hides them but a tap), so the
      // card would land on top of them: it takes their place instead, and a tap on it
      // brings them back.
      if (touchUIRef.current) hideControls()
    }, PAUSE_INFO_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [playing, buffering, scrubbing, hideControls])

  // ---- "You're watching" card ----
  // As an episode starts playing, a small card top-left says which one it is, then
  // fades away — most useful right after the next episode loaded by itself (or in
  // fullscreen, where nothing else on screen says so). Once per episode.
  const [nowPlayingPhase, setNowPlayingPhase] = useState<"hidden" | "visible" | "fading">("hidden")
  const nowPlayingShownRef = useRef(false)
  useEffect(() => {
    if (!playing || nowPlayingShownRef.current || !media?.episodeNumber) return
    nowPlayingShownRef.current = true
    setNowPlayingPhase("visible")
    const fade = window.setTimeout(() => setNowPlayingPhase("fading"), NOW_PLAYING_VISIBLE_MS)
    const hide = window.setTimeout(() => setNowPlayingPhase("hidden"), NOW_PLAYING_VISIBLE_MS + NOW_PLAYING_FADE_MS)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(hide)
    }
    // Only the first start counts; the timers must not restart on a pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const audioOptions = info?.audioTracks || []
  const trackListStyle = {
    "--track-list-max": `${Math.max(audioOptions.length, TRACK_MENU_MIN_ROWS) * TRACK_MENU_ROW_PX}px`,
  } as React.CSSProperties

  const audioLabels = useMemo(
    () => buildAudioLabels(info?.audioTracks || [], (i) => `${t("player.audio")} ${i + 1}`),
    [info, t]
  )
  const portalContainer = fullscreen ? containerRef.current : undefined
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  // With a mouse, a paused player always shows its controls. On touch they follow
  // taps instead, paused or not — tapping the picture hides them (handleSurfaceTap).
  const chromeVisible = showControls || buffering || (!playing && !touchUI)
  const showPauseCard = showPauseInfo && Boolean(media) && !(touchUI && chromeVisible)
  const compact = playerSize.width > 0 &&
    (playerSize.width < COMPACT_MAX_WIDTH || playerSize.height < COMPACT_MAX_HEIGHT)
  const tiny = compact && playerSize.height < TINY_MAX_HEIGHT
  const narrow = compact && playerSize.width < NARROW_MAX_WIDTH

  // A click/tap on the picture itself (the video, the pause card). Mouse: play/pause,
  // as on desktop players. Touch: show or hide the controls, never pause — pausing is
  // the play button's job; a phone user taps the picture to get at the controls, or
  // to get them out of the way.
  const handleSurfaceTap = () => {
    if (suppressTapRef.current) {
      suppressTapRef.current = false
      return
    }
    if (!touchUIRef.current) {
      togglePlay()
      return
    }
    if (chromeVisible) hideControls()
    else registerActivity()
  }

  const isEpisode = Boolean(media?.episodeNumber)
  const pauseSynopsis = media?.episodeSynopsis || media?.description || media?.longDescription || ""
  // The pause card's metadata, as a list so the divider between entries can be drawn by
  // position — the fields are all optional, and rendering them inline left dividers
  // dangling whenever one was missing.
  const pauseMeta: { key: string; node: React.ReactNode }[] = []
  if (media) {
    if (media.contentRating) {
      pauseMeta.push({
        key: "contentRating",
        // The one thing that stays a box: a maturity rating is read as a certification
        // mark, not as a word in a sentence.
        node: (
          <span className="rounded-[3px] border border-white/35 px-1.5 py-px text-[10px] font-medium tracking-wide text-white/80 sm:text-[11px]">
            {media.contentRating}
          </span>
        ),
      })
    }
    if (media.rating > 0) {
      pauseMeta.push({
        key: "rating",
        node: (
          <span className="flex items-center gap-1.5 font-semibold text-amber-400">
            <Star className="size-3.5 fill-current sm:size-4" />
            {media.rating.toFixed(1)}
          </span>
        ),
      })
    }
    if (media.year > 0) pauseMeta.push({ key: "year", node: <span>{media.year}</span> })
    if (media.duration && media.duration !== "-") {
      pauseMeta.push({ key: "duration", node: <span>{media.duration}</span> })
    }
    if (media.quality) {
      pauseMeta.push({ key: "quality", node: <span className="tracking-wide">{media.quality}</span> })
    }
    if (media.genre) {
      pauseMeta.push({ key: "genre", node: <span className="hidden sm:inline">{media.genre}</span> })
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative h-full w-full overflow-hidden bg-black",
        pseudoFullscreen && "!fixed inset-0 z-[100] h-[100dvh] w-screen",
        playing && !showControls && "cursor-none",
        // A long press is a scrub here, not the browser's own long-press (text
        // selection, the iOS callout, the save-video menu).
        "select-none [-webkit-touch-callout:none]"
      )}
      data-pseudo-fullscreen={pseudoFullscreen || undefined}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onContextMenu={(event) => {
        if (touchUIRef.current) event.preventDefault()
      }}
    >
      <video
        ref={videoRef}
        // In remux mode RemuxStream owns the source (a MediaSource object URL); React
        // must not put the raw file URL back.
        src={remuxMode ? undefined : src}
        title={title}
        className="h-full w-full"
        // Native mode: silent clock, sound comes from the separate <audio>. Remux
        // mode: this element plays the sound itself.
        muted={!remuxMode}
        playsInline
        data-player-surface
        onClick={() => handleSurfaceTap()}
        onError={(event) => {
          // A native <video> that can't open/decode the file (codec or container the
          // browser lacks) falls back to the ffmpeg remux pipeline instead of just
          // sitting on a black frame.
          if (!remuxMode && event.currentTarget.error) setNativeFailed(true)
        }}
        onVolumeChange={(event) => {
          if (!remuxMode) return
          setVolume(event.currentTarget.volume)
          setMuted(event.currentTarget.muted)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          // Only a pause the user actually asked for touches the UI. A
          // hidden/throttled tab pausing the muted clock-video on its own isn't a
          // real pause — the audio keeps playing and media-sync resumes the video
          // on return.
          if (intentPlayingRef.current || isBackgroundStall()) return
          setPlaying(false)
          const video = videoRef.current
          if (video && contentId) {
            lastProgressSaveAtRef.current = Date.now()
            saveWatchProgress(contentId, video.currentTime, video.duration || duration, seriesId, episodeRef)
          }
        }}
        onWaiting={() => {
          // Ignore the "waiting" storm a throttled hidden tab fires on the muted
          // video — nothing is actually loading, the audio never stopped.
          if (isBackgroundStall()) return
          setBuffering(true)
        }}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onEnded={handleVideoEnded}
        onTimeUpdate={(event) => {
          if (scrubbingRef.current) return
          const time = event.currentTarget.currentTime
          setCurrentTime(time)
          const now = Date.now()
          if (contentId && now - lastProgressSaveAtRef.current > PROGRESS_SAVE_INTERVAL_MS) {
            lastProgressSaveAtRef.current = now
            saveWatchProgress(contentId, time, event.currentTarget.duration || duration, seriesId, episodeRef)
          }
        }}
      />

      {/* Subtitles stay up while the pause card is showing. They used to be hidden for
          it, which made sense when the card covered the picture with artwork; now that
          it lets the frozen frame through, the line that was on screen has to stay on
          screen with it. All three layers sit at z-10, above the card (z-auto), so the
          card's scrim never washes them out. They freeze on their own: the clock they
          read stops advancing when playback does. */}

      {/* JASSUB (ASS/SSA subtitle renderer) mounts its own <canvas> inside this
          stable, React-childless container — see ass-renderer.ts for why the
          canvas can't be a React element. */}
      <div ref={assContainerRef} className="pointer-events-none absolute inset-0 z-10" />

      {/* Styled text-subtitle overlay (VTT/SRT) — our own render, off the audio clock */}
      {!isAssSubtitle && !isPgsSubtitle && (
        <SubtitleView cues={parsedCues} getTime={getSubtitleTime} />
      )}

      {/* Blu-ray (PGS) bitmap subtitles */}
      {isPgsSubtitle && (
        <PgsSubtitleView cuesRef={pgsCuesRef} getTime={getSubtitleTime} videoRef={videoRef} />
      )}

      {/* Sound source — hidden, kept in sync with the video above via useMediaSync */}
      <audio ref={audioRef} className="hidden" onVolumeChange={(event) => {
        setVolume(event.currentTarget.volume)
        setMuted(event.currentTarget.muted)
      }} />

      {/* Top gradient — only for depth/contrast when the chrome is showing */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent transition-opacity duration-300",
          chromeVisible ? "opacity-100" : "opacity-0"
        )}
      />

      {streamError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
          <p className="text-sm font-semibold text-white">{t("player.streamError")}</p>
          <p className="max-w-md break-words text-xs text-white/60">{streamError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setStreamError(null)
              remuxRef.current?.start(videoRef.current?.currentTime ?? 0, selectedAudioRef.current)
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {/* Audio state the viewer must know about. "blocked": the browser refused
          sound without a click — playback is held (never a silent picture) until
          they press play. "failed": every track failed to decode/transcode — a real
          playback error, not a selection problem. Muted / volume 0 need no banner:
          the volume button already shows them. */}
      {audioIssue && !streamError && (
        <div className="absolute inset-x-0 top-3 z-30 flex justify-center px-3 sm:top-5">
          {audioIssue === "blocked" ? (
            <button
              onClick={(event) => {
                event.stopPropagation()
                startPlayback()
              }}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md transition-colors animate-fade-in hover:bg-black/85 sm:text-sm"
            >
              <Volume2 className="size-4" />
              {t("player.audioBlocked")}
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-full bg-black/75 py-1.5 pl-4 pr-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md animate-fade-in sm:text-sm">
              <VolumeX className="size-4 text-white/70" />
              {t("player.audioFailed")}
              <Button
                variant="secondary"
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={(event) => {
                  event.stopPropagation()
                  setAudioIssue(null)
                  reloadAudio(videoRef.current?.currentTime ?? 0, selectedAudioRef.current)
                }}
              >
                {t("common.retry")}
              </Button>
            </div>
          )}
        </div>
      )}

      {buffering && !streamError && !scrubbing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Spinner className="size-7 text-white" />
          </div>
        </div>
      )}

      {/* "Paused for a while" info card — a left-anchored block with the title,
          season/episode, meta and synopsis. What sits behind it is the paused frame
          itself: no artwork is drawn over the video, so pausing freezes the picture
          (and its subtitle, which keeps rendering at z-10 above this) exactly where it
          stopped. The scrim comes in two parts: a flat dim that pushes the whole frame
          back so the card reads as the foreground, plus a ramp over the text column
          that takes it most of the way to black. The picture stays readable on the
          right, but it is clearly the background — the copy wins. Clicking anywhere on
          it resumes. Sits above the video but below the transport cluster and control
          bar (DOM order), so the play button and controls stay usable on top. */}
      {showPauseCard && media && (
        <div
          className="absolute inset-0 cursor-pointer animate-fade-in"
          data-player-surface
          onClick={() => handleSurfaceTap()}
        >
          {compact ? (
            /* Phone layout — its own design, not the desktop card scaled down. On a
               small screen the picture is the point, so the dim is light and the
               copy sits along the bottom edge (thumb reach, clear of the back button),
               on a ramp rising from it. One explicit "Resume" action, because on
               touch a tap on the picture shows the controls instead of resuming, and
               a progress line with the time left instead of a wall of metadata. */
            <>
              <div className="absolute inset-0 bg-black/35" />
              <div className="absolute inset-x-0 bottom-0 h-[85%] bg-gradient-to-t from-black/95 via-black/70 to-transparent" />

              <div className="absolute inset-x-0 bottom-0 px-4 pb-4 sm:px-6 sm:pb-5">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="animate-fade-up stagger-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70 ring-1 ring-white/15 backdrop-blur-sm">
                      <Pause className="size-2.5 fill-current" />
                      {t("player.paused")}
                    </span>
                    <h2 className="animate-fade-up stagger-2 mt-2 line-clamp-1 text-lg font-bold leading-tight tracking-tight text-white">
                      {title}
                    </h2>
                    {isEpisode && (
                      <p className="animate-fade-up stagger-2 mt-0.5 line-clamp-1 text-xs text-white/70">
                        {media.seasonNumber
                          ? t("player.seasonEpisode", { season: media.seasonNumber, episode: media.episodeNumber || 0 })
                          : t("player.episode", { episode: media.episodeNumber || 0 })}
                        {media.episodeTitle && <span className="text-white/50"> · {media.episodeTitle}</span>}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      startPlayback()
                    }}
                    className="animate-fade-up stagger-2 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white pl-3 pr-4 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform active:scale-95"
                  >
                    <Play className="size-4" fill="currentColor" />
                    {t("player.resume")}
                  </button>
                </div>

                {pauseSynopsis && !tiny && (
                  <p className="animate-fade-up stagger-3 mt-2.5 line-clamp-2 max-w-lg text-xs leading-relaxed text-white/60">
                    {pauseSynopsis}
                  </p>
                )}

                {duration > 0 && (
                  <div className="animate-fade-up stagger-3 mt-3 flex items-center gap-3">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full bg-white/90" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-white/60">
                      {t("player.timeLeft", { minutes: Math.max(1, Math.ceil((duration - currentTime) / 60)) })}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-black/55" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-transparent" />

              {/* Spacing is per-element rather than one flat gap: the eyebrow belongs tight
                  to the title, the synopsis wants air from the metadata. That rhythm is
                  most of what separates this from a stack of evenly spaced lines. */}
              <div className="relative flex h-full max-w-2xl flex-col justify-center px-6 sm:px-14">
                <div className="animate-fade-up stagger-1 flex items-center gap-2.5 text-white/45">
                  <Pause className="size-3.5 fill-current sm:size-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] sm:text-[11px]">
                    {t("player.paused")}
                  </span>
                </div>

                {/* font-bold, not font-black: at display sizes the heaviest weight closes up
                    the counters and reads as shouting rather than as a title card. */}
                <h2 className="animate-fade-up stagger-2 mt-3 text-balance text-3xl font-bold leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)] sm:mt-4 sm:text-5xl md:text-6xl">
                  {title}
                </h2>

                {isEpisode && (
                  <p className="animate-fade-up stagger-2 mt-2.5 text-sm font-medium text-white/85 sm:mt-3 sm:text-base">
                    {media.seasonNumber
                      ? t("player.seasonEpisode", { season: media.seasonNumber, episode: media.episodeNumber || 0 })
                      : t("player.episode", { episode: media.episodeNumber || 0 })}
                    {media.episodeTitle && <span className="text-white/55"> · {media.episodeTitle}</span>}
                  </p>
                )}

                {/* One muted line with hairline dividers instead of a row of mismatched
                    chips (a bordered box next to a filled pill next to bare text). Same
                    construction as the hero's metadata row, so the two read as one app.
                    Built as a list and joined so a missing field never strands a divider. */}
                {pauseMeta.length > 0 && (
                  <div className="animate-fade-up stagger-3 mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-xs text-white/60 sm:mt-4 sm:gap-x-3 sm:text-sm">
                    {pauseMeta.map((item, index) => (
                      <Fragment key={item.key}>
                        {index > 0 && <span aria-hidden className="h-3.5 w-px bg-white/25" />}
                        {item.node}
                      </Fragment>
                    ))}
                  </div>
                )}

                {pauseSynopsis && (
                  <p className="animate-fade-up stagger-4 mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-white/65 sm:mt-5 sm:line-clamp-4 sm:text-base">
                    {pauseSynopsis}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* "You're watching" — top-left, next to the page's back button (or in the
          corner in fullscreen, where that button is hidden). Same language as the
          pause card: no box, just type on a soft shade rising from the corner, the
          lines staggering in with fade-up. On the way out the whole group fades and
          drifts up over NOW_PLAYING_FADE_MS (the transition below), then unmounts. */}
      {nowPlayingPhase !== "hidden" && media && !showPauseCard && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-30 transition-[opacity,transform] duration-500 ease-(--ease-accel)",
            nowPlayingPhase === "visible" ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"
          )}
        >
          <div
            aria-hidden
            className="absolute left-0 top-0 h-36 w-[min(36rem,95%)] animate-fade-in bg-[radial-gradient(ellipse_at_top_left,rgba(0,0,0,0.72),rgba(0,0,0,0.35)_45%,transparent_72%)] sm:h-44"
          />
          <div
            className={cn(
              "relative max-w-[min(28rem,calc(100%-6rem))]",
              fullscreen ? "pl-5 pt-5 sm:pl-8 sm:pt-7" : "pl-14 pt-3.5 sm:pl-16 sm:pt-4"
            )}
          >
            <div className="animate-fade-up stagger-1 flex items-center gap-2 text-white/55">
              <Play className="size-2.5 fill-current sm:size-3" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] sm:text-[11px]">
                {t("player.youAreWatching")}
              </span>
            </div>
            <h2
              className={cn(
                "animate-fade-up stagger-2 mt-1.5 line-clamp-1 font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]",
                compact ? "text-base" : "text-lg sm:text-xl"
              )}
            >
              {title}
            </h2>
            <p className="animate-fade-up stagger-3 mt-0.5 line-clamp-1 text-xs text-white/75 sm:text-sm">
              {media.seasonNumber
                ? t("player.seasonEpisode", { season: media.seasonNumber, episode: media.episodeNumber || 0 })
                : t("player.episode", { episode: media.episodeNumber || 0 })}
              {media.episodeTitle && <span className="text-white/50"> · {media.episodeTitle}</span>}
            </p>
          </div>
        </div>
      )}

      {/* Hold-to-scrub indicator — the half being held lights up, with the speed and
          the time it has reached. The pill re-mounts on each speed step, so every
          step-up visibly pops. */}
      {scrub && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 z-30 flex w-1/2 items-center from-black/45 to-transparent animate-fade-in",
            scrub.direction < 0 ? "left-0 justify-start bg-gradient-to-r" : "right-0 justify-end bg-gradient-to-l"
          )}
        >
          <div className="mx-[10%] flex flex-col items-center gap-1.5">
            <div
              key={scrub.speed}
              className="flex items-center gap-2 rounded-full bg-black/55 px-3.5 py-1.5 text-white ring-1 ring-white/15 backdrop-blur-md animate-scale-in"
            >
              {scrub.direction < 0 ? (
                <Rewind className="size-4" fill="currentColor" />
              ) : (
                <FastForward className="size-4" fill="currentColor" />
              )}
              <span className="text-sm font-bold tabular-nums">x{scrub.speed}</span>
            </div>
            <span className="text-xs font-medium tabular-nums text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
              {formatTime(currentTime)}
            </span>
          </div>
        </div>
      )}

      {/* Center transport cluster — big play button when paused, skip/play/skip when playing+idle-visible */}
      {!buffering && chromeVisible && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300",
            compact ? "gap-7" : "gap-6 sm:gap-10",
            !playing && "bg-black/10"
          )}
        >
          <button
            onClick={() => skip(-SKIP_SECONDS)}
            aria-label={`-${SKIP_SECONDS}s`}
            className={cn(
              "group/skip pointer-events-auto flex cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20 hover:text-white active:scale-95",
              compact ? "size-10" : "size-11 sm:size-12"
            )}
          >
            <SkipIcon direction="back" seconds={SKIP_SECONDS} className="size-5" />
          </button>

          <button
            onClick={togglePlay}
            aria-label="Play/Pause"
            className={cn(
              "pointer-events-auto flex cursor-pointer items-center justify-center rounded-full bg-white/10 text-white shadow-[0_12px_36px_rgba(0,0,0,0.45)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20 active:scale-95",
              compact ? "size-14" : "size-16 sm:size-20"
            )}
          >
            {playing ? (
              <Pause className={compact ? "size-6" : "size-7 sm:size-8"} fill="currentColor" />
            ) : (
              <Play className={cn("ml-1", compact ? "size-6" : "size-7 sm:size-8")} fill="currentColor" />
            )}
          </button>

          <button
            onClick={() => skip(SKIP_SECONDS)}
            aria-label={`+${SKIP_SECONDS}s`}
            className={cn(
              "group/skip pointer-events-auto flex cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20 hover:text-white active:scale-95",
              compact ? "size-10" : "size-11 sm:size-12"
            )}
          >
            <SkipIcon direction="forward" seconds={SKIP_SECONDS} className="size-5" />
          </button>
        </div>
      )}

      {/* Bottom control bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-12 transition-opacity duration-300 sm:px-5 sm:pb-4",
          // The gradient itself never takes a tap or click — on a short player it
          // reaches up over the center play button. Only the bar's rows do; anything
          // else falls through to the picture below.
          "pointer-events-none",
          chromeVisible ? "opacity-100 [&>*]:pointer-events-auto" : "opacity-0"
        )}
      >
        {/* Seek bar — thin track that grows on hover, with a fill, a draggable thumb, and a hover thumbnail+time preview */}
        <div
          className="group/seek relative -mx-1 flex h-4 items-center px-1"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
            const x = ratio * rect.width
            const half = Math.min(THUMBNAIL_PREVIEW_WIDTH / 2, rect.width / 2)
            const clampedX = Math.min(Math.max(x, half), rect.width - half)
            const hoverSeconds = ratio * duration
            setHoverPreview({ x, clampedX, time: hoverSeconds })
            scheduleThumbnailFetch(hoverSeconds)
          }}
          onMouseLeave={() => {
            setHoverPreview(null)
            clearThumbnailPreview()
          }}
        >
          {hoverPreview && (
            <div
              className="pointer-events-none absolute bottom-5 -translate-x-1/2"
              style={{ left: `${hoverPreview.clampedX}px` }}
            >
              <div
                className="overflow-hidden rounded-md border border-white/15 bg-neutral-900 shadow-lg"
                style={{ width: THUMBNAIL_PREVIEW_WIDTH, aspectRatio: "16 / 9" }}
              >
                {hoverThumbSrc && (
                  <img src={hoverThumbSrc} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="mt-1 rounded-md bg-black/85 px-2 py-1 text-center text-[11px] font-medium tabular-nums text-white shadow-lg">
                {formatTime(hoverPreview.time)}
              </div>
            </div>
          )}
          <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/25 transition-all duration-150 group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progressPct}%` }} />
          </div>
          <div
            className="pointer-events-none absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md transition-opacity duration-150 group-hover/seek:opacity-100"
            style={{ left: `calc(${progressPct}% - 6px)` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.5}
            value={Math.min(currentTime, duration || currentTime)}
            onChange={(event) => setCurrentTime(Number(event.target.value))}
            onPointerDown={() => { scrubbingRef.current = true }}
            onPointerUp={(event) => {
              scrubbingRef.current = false
              seekTo(Number((event.target as HTMLInputElement).value))
            }}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
          />
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="rounded-md text-white hover:bg-white/10 hover:text-white" onClick={togglePlay}>
            {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
          </Button>

          <Button variant="ghost" size="icon" className="hidden rounded-md text-white hover:bg-white/10 hover:text-white sm:inline-flex" onClick={() => skip(-SKIP_SECONDS)}>
            <RotateCcw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden rounded-md text-white hover:bg-white/10 hover:text-white sm:inline-flex" onClick={() => skip(SKIP_SECONDS)}>
            <RotateCw className="size-4" />
          </Button>

          {/* Previous / next episode — fullscreen only: outside it the page's own
              episode list sits right below the player. Both go through onPlayNext,
              the same path as the next-episode card, so fullscreen carries over (see
              fullscreenTarget). A missing neighbour shows its button disabled, so the
              pair never shifts the rest of the bar around. */}
          {fullscreen && (previousEpisode || nextEpisode) && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-md text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
                disabled={!previousEpisode}
                aria-label={t("player.previous")}
                title={t("player.previous")}
                onClick={() => previousEpisode && onPlayNext?.(previousEpisode)}
              >
                <SkipBack className="size-4" fill="currentColor" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-md text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
                disabled={!nextEpisode}
                aria-label={t("player.next")}
                title={t("player.next")}
                onClick={playNextNow}
              >
                <SkipForward className="size-4" fill="currentColor" />
              </Button>
            </>
          )}

          <div className="group/volume flex items-center">
            <Button variant="ghost" size="icon" className="rounded-md text-white hover:bg-white/10 hover:text-white" onClick={toggleMute}>
              <VolumeIcon muted={muted} volume={volume} className="size-4" />
            </Button>
            {/* Hidden until hover — reveals a filled track (painted = current volume, left of the thumb) */}
            <div className="hidden w-0 items-center overflow-hidden transition-all duration-200 ease-out group-hover/volume:w-[74px] sm:flex">
              <div className="relative mx-[5px] flex h-4 w-16 shrink-0 items-center">
                <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
                </div>
                <div
                  className="pointer-events-none absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-white shadow"
                  style={{ left: `calc(${(muted ? 0 : volume) * 100}% - 5px)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
                />
              </div>
            </div>
          </div>

          <span className="ml-1 text-xs tabular-nums text-white/85 sm:text-sm">
            {formatTime(currentTime)} <span className="text-white/45">/ {formatTime(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            {audioOptions.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t("player.audio")} className="rounded-md text-white hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10">
                    <Languages className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent container={portalContainer} align="end" side="top" className={TRACK_MENU_CLASS}>
                  <DropdownMenuLabel className="text-xs text-neutral-400">{t("player.audio")}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-neutral-800" />
                  <ScrollArea className={TRACK_SCROLL_CLASS} style={trackListStyle} viewportClassName={TRACK_VIEWPORT_CLASS} viewportRef={revealCheckedTrack}>
                    <DropdownMenuRadioGroup value={String(selectedAudio)} onValueChange={handleAudioChange}>
                      {audioOptions.map((track, idx) => (
                        <DropdownMenuRadioItem indicator="start" key={track.index} value={String(track.index)} className="text-xs focus:bg-neutral-800 focus:text-white">
                          {audioLabels[idx]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {subtitleOptions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t("player.subtitles")} className="rounded-md text-white hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10">
                    <SubtitlesIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent container={portalContainer} align="end" side="top" className={TRACK_MENU_CLASS}>
                  <DropdownMenuLabel className="text-xs text-neutral-400">{t("player.subtitles")}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-neutral-800" />
                  <ScrollArea className={TRACK_SCROLL_CLASS} style={trackListStyle} viewportClassName={TRACK_VIEWPORT_CLASS} viewportRef={revealCheckedTrack}>
                    <DropdownMenuRadioGroup value={selectedSubtitle === null ? OFF_VALUE : String(selectedSubtitle)} onValueChange={handleSubtitleChange}>
                      <DropdownMenuRadioItem indicator="start" value={OFF_VALUE} className="text-xs focus:bg-neutral-800 focus:text-white">
                        {t("player.off")}
                      </DropdownMenuRadioItem>
                      {subtitleOptions.map((track, idx) => (
                        <DropdownMenuRadioItem indicator="start" key={track.index} value={String(track.index)} className="text-xs focus:bg-neutral-800 focus:text-white">
                          {subtitleLabels[idx]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("player.speed")} className="rounded-md text-white hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10">
                  <Gauge className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent container={portalContainer} align="end" side="top" className="w-40 border-neutral-800 bg-neutral-950 text-neutral-200">
                <DropdownMenuLabel className="text-xs text-neutral-400">{t("player.speed")}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-neutral-800" />
                <DropdownMenuRadioGroup value={String(rate)} onValueChange={handleRateChange}>
                  {PLAYBACK_RATES.map((r) => (
                    <DropdownMenuRadioItem indicator="start" key={r} value={String(r)} className="text-xs focus:bg-neutral-800 focus:text-white">
                      {r}x
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="rounded-md text-white hover:bg-white/10 hover:text-white" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* "Skip intro" / "Skip ending" — floating over the picture for the configured
          opening, or the ending of an episode with a post-credits scene. Seeking keeps
          the current play/pause state, so playback just carries on from the target.
          z-30: above the subtitle layer (z-10) and the control bar; inside the
          container, so it's there in fullscreen too. */}
      {skipAction && (
        <button
          key={skipAction.label}
          onClick={(event) => {
            event.stopPropagation()
            seekTo(skipAction.to)
          }}
          className="absolute bottom-16 right-3 z-30 flex cursor-pointer items-center gap-2 rounded-md bg-black/55 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-white/30 backdrop-blur-md transition-all animate-scale-in hover:bg-white hover:text-black active:scale-95 sm:bottom-28 sm:right-6 sm:px-5 sm:py-2.5 sm:text-base"
        >
          {skipAction.label}
          <SkipForward className="size-4" fill="currentColor" />
        </button>
      )}

      {/* Next episode — shown over the ending (see nextPlan). Counts down and then
          advances only for episodes without post-credits content; a click always
          advances. */}
      {/* Phone layout of the same card — its own design, like the pause card's: a strip
          along the bottom edge instead of a floating box, on a ramp rising from it, so
          the credits still playing above stay in view. The play button doubles as the
          countdown, filling up as it runs (the text inverts over the fill). It moves
          up over the control bar while that is showing. */}
      {showNextCard && nextEpisode && compact && (
        <div
          className={cn(
            "absolute inset-x-0 z-30 animate-fade-in transition-[bottom] duration-300",
            chromeVisible ? "bottom-20" : "bottom-0"
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-[190%] bg-gradient-to-t from-black/95 via-black/75 to-transparent transition-opacity duration-300",
              chromeVisible && "opacity-0"
            )}
          />
          <div className="relative flex items-center gap-3 px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
            <button
              onClick={playNextNow}
              className="relative aspect-video h-12 shrink-0 cursor-pointer overflow-hidden rounded-md bg-neutral-900 ring-1 ring-white/15 sm:h-14"
              aria-label={t("player.nextEpisode")}
            >
              {nextEpisodeImage ? (
                <img src={nextEpisodeImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-neutral-800" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {/* Narrow: the play button already shows the seconds left. */}
                {countdownActive && !narrow
                  ? t("player.nextEpisodeIn", { seconds: Math.ceil(countdownRemaining) })
                  : t("player.nextEpisode")}
              </p>
              <p className="mt-0.5 line-clamp-1 text-sm font-semibold text-white">
                {nextEpisode.episodeTitle || nextEpisode.title}
              </p>
              {Boolean(nextEpisode.seasonNumber || nextEpisode.episodeNumber) && (
                <p className="line-clamp-1 text-[11px] text-white/55">
                  {t("player.seasonEpisode", {
                    season: nextEpisode.seasonNumber || 1,
                    episode: nextEpisode.episodeNumber || 0,
                  })}
                </p>
              )}
            </div>
            <button
              onClick={dismissNextEpisode}
              aria-label={countdownActive ? t("player.cancelAutoplay") : t("player.closeCard")}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/85 ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-95"
            >
              <X className="size-4" />
            </button>
            <button
              onClick={playNextNow}
              className={cn(
                "relative flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-full text-sm font-semibold",
                narrow ? "min-w-9 px-2.5" : "pl-3 pr-4",
                "shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform active:scale-95",
                countdownActive ? "bg-white/20 text-white ring-1 ring-white/25 backdrop-blur-md" : "bg-white text-black"
              )}
            >
              {countdownActive && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-white transition-[width] duration-300 ease-linear"
                  style={{ width: `${Math.min(100, (countdownElapsed / countdownTotal) * 100)}%` }}
                />
              )}
              <span className={cn("relative flex items-center gap-1.5", countdownActive && "text-white mix-blend-difference")}>
                <Play className="size-4" fill="currentColor" />
                {/* Narrow: the seconds left (or nothing) instead of the label. */}
                {narrow
                  ? countdownActive && <span className="tabular-nums">{Math.ceil(countdownRemaining)}</span>
                  : t("common.play")}
              </span>
            </button>
          </div>
        </div>
      )}

      {showNextCard && nextEpisode && !compact && (
        <div className="absolute bottom-16 right-3 z-30 h-[88px] w-[min(412px,calc(100%-24px))] overflow-hidden rounded-lg bg-neutral-950/95 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl animate-scale-in sm:bottom-28 sm:right-6 sm:h-[127px]">
          {countdownActive && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 bg-white/10">
              <div
                className="h-full bg-white transition-[width] duration-300 ease-linear"
                style={{ width: `${Math.min(100, (countdownElapsed / countdownTotal) * 100)}%` }}
              />
            </div>
          )}
          <button
            onClick={dismissNextEpisode}
            aria-label={countdownActive ? t("player.cancelAutoplay") : t("player.closeCard")}
            className="absolute right-1.5 top-1.5 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
          >
            <X className="size-3" />
          </button>
          <button onClick={playNextNow} className="group flex h-full w-full cursor-pointer text-left">
            <div className="relative h-full aspect-video shrink-0 overflow-hidden bg-neutral-900">
              {nextEpisodeImage ? (
                <img
                  src={nextEpisodeImage}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full bg-neutral-800" />
              )}
              <div className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex size-9 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-110">
                  <Play className="ml-0.5 size-3.5" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {countdownActive
                  ? t("player.nextEpisodeIn", { seconds: Math.ceil(countdownRemaining) })
                  : t("player.nextEpisode")}
              </p>
              <p className="mt-0.5 line-clamp-1 text-[13px] font-semibold text-white">
                {nextEpisode.episodeTitle || nextEpisode.title}
              </p>
              {Boolean(nextEpisode.seasonNumber || nextEpisode.episodeNumber) && (
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {t("player.seasonEpisode", {
                    season: nextEpisode.seasonNumber || 1,
                    episode: nextEpisode.episodeNumber || 0,
                  })}
                </p>
              )}
              {(nextEpisode.episodeSynopsis || nextEpisode.description) && (
                <p className="mt-1 hidden text-[11px] leading-snug text-neutral-400 sm:line-clamp-2">
                  {nextEpisode.episodeSynopsis || nextEpisode.description}
                </p>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
