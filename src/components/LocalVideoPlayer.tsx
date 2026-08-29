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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
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
import { activeCueHtml, useParsedSubtitles, type SubtitleCue } from "@/lib/vtt-subtitles"
import { backdropUrl, posterUrl, type Movie } from "@/lib/data"
import { clearWatchProgress, getWatchProgress, saveWatchProgress } from "@/lib/watch-progress"
import { getMediaPrefs, resolveAudioIndex, resolveSubtitleIndex, saveMediaPrefs } from "@/lib/media-prefs"
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
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

const VIDEO_API_PREFIX = "/api/local-video/"
const THUMBNAIL_API_PREFIX = "/api/local-thumbnail/"
const THUMBNAIL_PREGEN_API_PREFIX = "/api/local-thumbnail-pregenerate/"
const OFF_VALUE = "off"
const SEEK_RELOAD_DEBOUNCE_MS = 250
// Below this, a video.currentTime jump isn't treated as a real seek — see onSeeking/onSeeked.
const SEEK_RELOAD_MIN_JUMP_S = 1.5
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const CONTROLS_IDLE_MS = 2800
// How long the video has to sit paused before the streaming-style info card
// (artwork + title + season/episode + synopsis + rating) fades in over it.
const PAUSE_INFO_DELAY_MS = 5000
const SKIP_SECONDS = 10
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
// How long the "next episode" card stays up before auto-advancing, counted from
// the moment credits are detected — not from the end of the file, since credits
// sequences vary from a few seconds to several minutes.
const AUTOPLAY_DELAY_S = 10
// When no chapter data pins down where credits actually start, fall back to
// treating the last N seconds of the file as "credits" — a rough guess, but
// better than nothing for files without chapter markers.
const CREDITS_FALLBACK_LAST_S = 45

interface Track {
  index: number
  codec: string
  language: string
  title: string
  format?: "vtt" | "ass"
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
}

function trackLabel(track: Track, fallback: string): string {
  return track.title || track.language || fallback
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
// outline for legibility over any frame, no box, ~2 lines, lifted above the
// control bar while the chrome is showing.
function SubtitleView({
  cues,
  getTime,
  raised,
}: {
  cues: SubtitleCue[]
  getTime: () => number
  raised: boolean
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
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 flex justify-center px-[5%] transition-[bottom] duration-300",
        raised ? "bottom-[16%] sm:bottom-[18%]" : "bottom-[7%]"
      )}
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
  onPlayNext?: (movie: Movie) => void
  // The movie/episode currently playing — feeds the "paused for a while" info
  // card (artwork, title, season/episode, synopsis, rating…), streaming-app style.
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

  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [selectedAudio, setSelectedAudio] = useState(0)
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [buffering, setBuffering] = useState(false)
  const [showPauseInfo, setShowPauseInfo] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [hoverPreview, setHoverPreview] = useState<{ x: number; clampedX: number; time: number } | null>(null)
  const [hoverThumbSrc, setHoverThumbSrc] = useState<string | null>(null)
  const playingRef = useRef(false)
  const activityTimerRef = useRef<number | null>(null)
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
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [relPath])

  const duration = info?.duration || videoRef.current?.duration || 0

  // ---- Audio track: separate element kept in lockstep with the video (master clock) ----
  const audioOffsetRef = useRef(0) // absolute movie time the *current* audio stream's t=0 maps to
  const audioGenerationRef = useRef(0) // race guard: only the latest reload may apply once ready
  const audioInitializedRef = useRef(false)
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

  // Some source files fail to transcode on the first attempt (a transient ffmpeg
  // hiccup, or a track/codec the server can't decode) and the <audio> element would
  // otherwise just sit there forever with no sound and no indication anything went
  // wrong. Retry once, and if that also fails, fall back to any other available
  // track so the movie is never silently mute.
  const reloadAudio = useCallback((absoluteSeconds: number, trackIndex: number, isRetry = false) => {
    const audio = audioRef.current
    if (!audio || !relPath) return
    const generation = ++audioGenerationRef.current
    audio.pause()
    const start = Math.max(0, absoluteSeconds)
    audio.src = `/api/local-audio/${encodeURIComponent(relPath)}?track=${trackIndex}&start=${start.toFixed(3)}`
    audio.load()
    const onReady = () => {
      if (audioGenerationRef.current !== generation) return // a newer switch/seek already won
      audio.removeEventListener("error", onError)
      audioOffsetRef.current = start
      const video = videoRef.current
      if (video && !video.paused) audio.play().catch(() => {})
    }
    const onError = () => {
      if (audioGenerationRef.current !== generation) return
      audio.removeEventListener("canplay", onReady)
      if (!isRetry) {
        window.setTimeout(() => {
          if (audioGenerationRef.current === generation) reloadAudio(absoluteSeconds, trackIndex, true)
        }, 500)
        return
      }
      const fallback = audioOptionsRef.current.find((track) => track.index !== trackIndex)
      if (fallback) {
        setSelectedAudio(fallback.index)
        reloadAudio(absoluteSeconds, fallback.index)
      }
    }
    audio.addEventListener("canplay", onReady, { once: true })
    audio.addEventListener("error", onError, { once: true })
  }, [relPath])

  useMediaSync(videoRef, audioRef, audioOffsetRef, intentPlayingRef, true, debugSync)

  // Any real seek — scrub bar, chapter jump, anything that moves video.currentTime —
  // needs a fresh audio stream from the new position. This is a native listener on
  // the video element itself (not tied to our own UI handlers) so it covers every
  // way currentTime can change, per the "don't special-case one interaction" brief.
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
    if (!video) return
    let debounceId: number | null = null
    const isRealSeek = () => {
      const audio = audioRef.current
      if (!audio) return true
      const audioAbsolute = audioOffsetRef.current + audio.currentTime
      return Math.abs(video.currentTime - audioAbsolute) >= SEEK_RELOAD_MIN_JUMP_S
    }
    const onSeeking = () => {
      if (!isRealSeek()) return
      audioRef.current?.pause()
    }
    const onSeeked = () => {
      if (!isRealSeek()) return
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
  }, [reloadAudio])

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
    if (!video || !audio) return
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
  }, [reloadAudio])

  // Persist the current audio-language / subtitle pick against this title so the
  // next episode opens the same way. Stored by language, not index — see media-prefs.
  const persistPrefs = useCallback((audioIdx: number, subtitleIdx: number | null) => {
    if (!prefsKey || !info) return
    const audio = info.audioTracks.find((track) => track.index === audioIdx)
    const subtitle = subtitleIdx === null
      ? null
      : info.subtitleTracks.find((track) => track.index === subtitleIdx) || null
    saveMediaPrefs(prefsKey, {
      audioLanguage: audio?.language || null,
      audioTitle: audio?.title || null,
      subtitleLanguage: subtitle?.language || null,
      subtitleTitle: subtitle?.title || null,
      subtitleForced: Boolean(subtitle?.forced),
    })
  }, [prefsKey, info])

  const handleAudioChange = useCallback((value: string) => {
    const idx = Number(value)
    setSelectedAudio(idx)
    const video = videoRef.current
    reloadAudio(video?.currentTime ?? 0, idx)
    persistPrefs(idx, selectedSubtitleRef.current)
  }, [reloadAudio, persistPrefs])

  const handleSubtitleChange = useCallback((value: string) => {
    const next = value === OFF_VALUE ? null : Number(value)
    setSelectedSubtitle(next)
    persistPrefs(selectedAudioRef.current, next)
  }, [persistPrefs])

  // Apply the saved audio-language / subtitle choice once this file's track list
  // is known. Runs a single time per mount; the user's later picks are theirs to
  // keep. If audio already started on the default track, hop it to the resolved
  // one (a brief reload, only when the saved language isn't track 0).
  const prefsAppliedRef = useRef(false)
  useEffect(() => {
    if (!info || prefsAppliedRef.current) return
    prefsAppliedRef.current = true
    const prefs = getMediaPrefs(prefsKey)
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
  }, [info, prefsKey, reloadAudio])

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

  const getSubtitleTime = useCallback(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (
      audio &&
      audioInitializedRef.current &&
      !audio.paused &&
      audio.readyState >= 2 &&
      Number.isFinite(audio.currentTime)
    ) {
      return audioOffsetRef.current + audio.currentTime
    }
    return video?.currentTime ?? 0
  }, [])

  const vttSubUrl = !isAssSubtitle && relPath && selectedSubtitleTrack
    ? `/api/local-subtitle/${encodeURIComponent(relPath)}?stream=${selectedSubtitleTrack.index}`
    : null
  const parsedCues = useParsedSubtitles(vttSubUrl)

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

  // ---- Next episode: card appears once credits actually start, auto-advance
  // AUTOPLAY_DELAY_S later (or sooner if the video ends first). LocalVideoPlayer
  // is remounted (key={trailerUrl} in PlayerPage) on every episode switch, so
  // nextDismissed starts fresh each time.
  const [nextDismissed, setNextDismissed] = useState(false)

  // Where credits start: prefer a chapter actually named "Credits" (or the
  // Spanish/French equivalent some rips use), then fall back to treating a short
  // final chapter as credits, then to a flat last-N-seconds guess when the file
  // has no chapter markers at all.
  const creditsStartSeconds = useMemo(() => {
    const chapters = info?.chapters || []
    if (chapters.length > 0) {
      const named = chapters.find((chapter) => /cr[ée]dit/i.test(chapter.title))
      if (named) return named.start
      if (chapters.length >= 2) {
        const last = chapters[chapters.length - 1]
        const lastLength = (last.end || duration) - last.start
        if (lastLength > 0 && lastLength <= Math.min(300, duration * 0.2)) return last.start
      }
    }
    return duration > 0 ? Math.max(0, duration - CREDITS_FALLBACK_LAST_S) : null
  }, [info, duration])

  const showNextCard =
    Boolean(nextEpisode) && !nextDismissed && creditsStartSeconds !== null && currentTime >= creditsStartSeconds
  const nextCountdown = creditsStartSeconds !== null
    ? Math.max(0, Math.ceil(AUTOPLAY_DELAY_S - (currentTime - creditsStartSeconds)))
    : AUTOPLAY_DELAY_S

  const dismissNextEpisode = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    setNextDismissed(true)
  }, [])

  const playNextNow = useCallback(() => {
    if (nextEpisode) onPlayNext?.(nextEpisode)
  }, [nextEpisode, onPlayNext])

  const handleVideoEnded = useCallback(() => {
    intentPlayingRef.current = false
    if (contentId) clearWatchProgress(contentId)
    if (nextEpisode && !nextDismissed) onPlayNext?.(nextEpisode)
  }, [contentId, nextEpisode, nextDismissed, onPlayNext])

  // The countdown can reach zero well before the file actually ends (credits can
  // run for minutes) — advance right then instead of waiting for the native
  // `ended` event, which stays as a safety net for the rest of the cases.
  useEffect(() => {
    if (showNextCard && nextCountdown === 0 && nextEpisode) onPlayNext?.(nextEpisode)
  }, [showNextCard, nextCountdown, nextEpisode, onPlayNext])

  const nextEpisodeImage = nextEpisode
    ? backdropUrl(nextEpisode.backdropPath) || posterUrl(nextEpisode.posterPath)
    : null

  // ---- Transport controls ----
  const startPlayback = useCallback(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video) return
    intentPlayingRef.current = true
    if (!audioInitializedRef.current) {
      audioInitializedRef.current = true
      reloadAudio(video.currentTime, selectedAudioRef.current)
    }
    video.play().catch(() => {})
    audio?.play().catch(() => {})
  }, [reloadAudio])

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
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const resumeAndPlay = () => {
      const saved = contentId ? getWatchProgress(contentId) : null
      if (saved && saved.currentTime > 0) {
        try {
          video.currentTime = saved.currentTime
          setCurrentTime(saved.currentTime)
        } catch {
          // Ignore — playback just starts from 0 instead.
        }
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
  }, [src])

  // Persist "Continue Watching" progress when leaving this episode/movie —
  // navigating back, switching episodes (this component remounts fully on
  // every switch via key={trailerUrl} in PlayerPage), or closing the tab.
  useEffect(() => {
    const saveNow = () => {
      const video = videoRef.current
      if (!video || !contentId) return
      saveWatchProgress(contentId, video.currentTime, video.duration || duration, seriesId)
    }
    window.addEventListener("beforeunload", saveNow)
    return () => {
      window.removeEventListener("beforeunload", saveNow)
      saveNow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, seriesId])

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
    return () => {
      navigator.mediaSession.setActionHandler("play", null)
      navigator.mediaSession.setActionHandler("pause", null)
      navigator.mediaSession.setActionHandler("seekbackward", null)
      navigator.mediaSession.setActionHandler("seekforward", null)
      navigator.mediaSession.setActionHandler("nexttrack", null)
    }
  }, [title, startPlayback, skip, nextEpisode, onPlayNext])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.playbackState = playing ? "playing" : "paused"
  }, [playing])

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
    setMuted(audio.muted)
  }, [])

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    const next = Number(event.target.value)
    setVolume(next)
    if (audio) {
      audio.volume = next
      audio.muted = next === 0
      setMuted(next === 0)
    }
  }, [])

  const handleRateChange = useCallback((value: string) => {
    const next = Number(value)
    setRate(next)
    const video = videoRef.current
    if (video) video.playbackRate = next // useMediaSync propagates this to the audio element
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else containerRef.current.requestFullscreen().catch(() => {})
  }, [])

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])

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
    else setShowControls(true)
  }, [playing, registerActivity])

  useEffect(() => () => {
    if (activityTimerRef.current !== null) window.clearTimeout(activityTimerRef.current)
  }, [])

  // ---- "Paused for a while" info card ----
  // After the video sits paused (not buffering, not on the credits/next card) for
  // PAUSE_INFO_DELAY_MS, fade in a streaming-style card with the artwork and the
  // episode/movie details. Any resume hides it immediately.
  useEffect(() => {
    if (playing || buffering) {
      setShowPauseInfo(false)
      return
    }
    const id = window.setTimeout(() => setShowPauseInfo(true), PAUSE_INFO_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [playing, buffering])

  const audioOptions = info?.audioTracks || []
  const portalContainer = fullscreen ? containerRef.current : undefined
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const chromeVisible = showControls || !playing || buffering

  const isEpisode = Boolean(media?.episodeNumber)
  const pauseArt = media
    ? backdropUrl(media.backdropPath, "w1280") || posterUrl(media.posterPath, "w500")
    : null
  const pauseSynopsis = media?.episodeSynopsis || media?.description || media?.longDescription || ""

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative flex h-full w-full items-center justify-center overflow-hidden",
        // The <video> is sized to its own aspect ratio and centred (not
        // object-fit: contain, which makes Chrome paint opaque black bars), so
        // the page's blurred backdrop shows around it. Solid black in fullscreen.
        fullscreen ? "bg-black" : "bg-transparent",
        playing && !showControls && "cursor-none"
      )}
      onMouseMove={registerActivity}
      onTouchStart={registerActivity}
    >
      <video
        ref={videoRef}
        src={src}
        title={title}
        className="max-h-full max-w-full"
        muted
        playsInline
        onClick={togglePlay}
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
            saveWatchProgress(contentId, video.currentTime, video.duration || duration, seriesId)
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
            saveWatchProgress(contentId, time, event.currentTarget.duration || duration, seriesId)
          }
        }}
      />

      {/* JASSUB (ASS/SSA subtitle renderer) mounts its own <canvas> inside this
          stable, React-childless container — see ass-renderer.ts for why the
          canvas can't be a React element. */}
      <div
        ref={assContainerRef}
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity",
          showPauseInfo && "opacity-0"
        )}
      />

      {/* Styled text-subtitle overlay (VTT/SRT) — our own render, off the audio clock */}
      {!isAssSubtitle && !showPauseInfo && (
        <SubtitleView cues={parsedCues} getTime={getSubtitleTime} raised={chromeVisible} />
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

      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Spinner className="size-7 text-white" />
          </div>
        </div>
      )}

      {/* "Paused for a while" info card — streaming-app style: full-bleed artwork
          behind a left-anchored block with the title, season/episode, meta and
          synopsis. Clicking anywhere on it resumes. Sits above the video but
          below the transport cluster and control bar (DOM order), so the play
          button and controls stay usable on top of it. */}
      {showPauseInfo && media && (
        <div
          className="absolute inset-0 cursor-pointer animate-fade-in"
          onClick={togglePlay}
        >
          {pauseArt && (
            <img src={pauseArt} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

          <div className="relative flex h-full max-w-2xl flex-col justify-center gap-2 px-6 sm:gap-3 sm:px-14">
            <p className="animate-fade-up stagger-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55 sm:text-xs">
              {t("player.paused")}
            </p>
            <h2 className="animate-fade-up stagger-2 text-balance text-2xl font-black leading-tight text-white drop-shadow-lg sm:text-4xl md:text-5xl">
              {title}
            </h2>
            {isEpisode && (
              <p className="animate-fade-up stagger-2 text-sm font-semibold text-white/90 sm:text-lg">
                {media.seasonNumber
                  ? t("player.seasonEpisode", { season: media.seasonNumber, episode: media.episodeNumber || 0 })
                  : t("player.episode", { episode: media.episodeNumber || 0 })}
                {media.episodeTitle ? ` · ${media.episodeTitle}` : ""}
              </p>
            )}
            <div className="animate-fade-up stagger-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/70 sm:text-sm">
              {media.rating > 0 && (
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Star className="size-3.5 fill-current sm:size-4" />
                  {media.rating.toFixed(1)}
                </span>
              )}
              {media.year > 0 && <span>{media.year}</span>}
              {media.contentRating && (
                <span className="rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-medium tracking-wide sm:text-[11px]">
                  {media.contentRating}
                </span>
              )}
              {media.quality && (
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide sm:text-[11px]">
                  {media.quality}
                </span>
              )}
              {media.duration && media.duration !== "-" && <span>{media.duration}</span>}
              {media.genre && <span className="hidden sm:inline">{media.genre}</span>}
            </div>
            {pauseSynopsis && (
              <p className="animate-fade-up stagger-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-white/75 sm:line-clamp-4 sm:text-base">
                {pauseSynopsis}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Center transport cluster — big play button when paused, skip/play/skip when playing+idle-visible */}
      {!buffering && chromeVisible && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center gap-6 transition-opacity duration-300 sm:gap-10",
            !playing && "bg-black/10"
          )}
        >
          <button
            onClick={() => skip(-SKIP_SECONDS)}
            aria-label={`-${SKIP_SECONDS}s`}
            className="group/skip pointer-events-auto flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20 hover:text-white active:scale-95 sm:size-12"
          >
            <SkipIcon direction="back" seconds={SKIP_SECONDS} className="size-5" />
          </button>

          <button
            onClick={togglePlay}
            aria-label="Play/Pause"
            className="pointer-events-auto flex size-16 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white shadow-[0_12px_36px_rgba(0,0,0,0.45)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20 active:scale-95 sm:size-20"
          >
            {playing ? (
              <Pause className="size-7 sm:size-8" fill="currentColor" />
            ) : (
              <Play className="ml-1 size-7 sm:size-8" fill="currentColor" />
            )}
          </button>

          <button
            onClick={() => skip(SKIP_SECONDS)}
            aria-label={`+${SKIP_SECONDS}s`}
            className="group/skip pointer-events-auto flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20 hover:text-white active:scale-95 sm:size-12"
          >
            <SkipIcon direction="forward" seconds={SKIP_SECONDS} className="size-5" />
          </button>
        </div>
      )}

      {/* Bottom control bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-12 transition-opacity duration-300 sm:px-5 sm:pb-4",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
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
                <DropdownMenuContent container={portalContainer} align="end" side="top" className="w-52 border-neutral-800 bg-neutral-950 text-neutral-200">
                  <DropdownMenuLabel className="text-xs text-neutral-400">{t("player.audio")}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-neutral-800" />
                  <DropdownMenuRadioGroup value={String(selectedAudio)} onValueChange={handleAudioChange}>
                    {audioOptions.map((track, idx) => (
                      <DropdownMenuRadioItem key={track.index} value={String(track.index)} className="text-xs focus:bg-neutral-800 focus:text-white">
                        {trackLabel(track, `${t("player.audio")} ${idx + 1}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
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
                <DropdownMenuContent container={portalContainer} align="end" side="top" className="w-52 border-neutral-800 bg-neutral-950 text-neutral-200">
                  <DropdownMenuLabel className="text-xs text-neutral-400">{t("player.subtitles")}</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-neutral-800" />
                  <DropdownMenuRadioGroup value={selectedSubtitle === null ? OFF_VALUE : String(selectedSubtitle)} onValueChange={handleSubtitleChange}>
                    <DropdownMenuRadioItem value={OFF_VALUE} className="text-xs focus:bg-neutral-800 focus:text-white">
                      {t("player.off")}
                    </DropdownMenuRadioItem>
                    {subtitleOptions.map((track, idx) => (
                      <DropdownMenuRadioItem key={track.index} value={String(track.index)} className="text-xs focus:bg-neutral-800 focus:text-white">
                        {subtitleLabels[idx]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
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
                    <DropdownMenuRadioItem key={r} value={String(r)} className="text-xs focus:bg-neutral-800 focus:text-white">
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

      {/* Next episode — countdown card in the closing seconds, auto-advance on end */}
      {showNextCard && nextEpisode && (
        <div className="absolute bottom-24 right-3 z-30 h-[127px] w-[min(412px,calc(100vw-24px))] overflow-hidden rounded-lg bg-neutral-950/95 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl animate-scale-in sm:bottom-28 sm:right-6">
          <button
            onClick={dismissNextEpisode}
            aria-label={t("player.cancelAutoplay")}
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
                {t("player.nextEpisodeIn", { seconds: nextCountdown })}
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
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-neutral-400">
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
