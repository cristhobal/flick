"use client"

// Custom VLC-style player for local files (dev-only local library).
//
// Architecture: the <video> element is muted and is the single master clock — its
// src is the raw file (byte-range seekable, native instant seeking) and it is NEVER
// reloaded when the user switches audio/subtitle tracks. Sound comes from a separate,
// hidden <audio> element sourced from a per-track ffmpeg transcode
// (/api/local-audio/...), kept locked to the video via useMediaSync (continuous
// play/pause/drift correction) plus a direct reload-on-seek path here (any jump needs
// a fresh transcoded stream from the new position — see reloadAudio). Subtitles use
// native <track> for SRT/VTT-derived text, and JASSUB (WASM libass) for ASS/SSA so
// original styling, fonts and positioning survive — see ass-renderer.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useI18n } from "@/i18n/I18nProvider"
import { useMediaSync } from "@/lib/media-sync"
import { useAssSubtitle } from "@/lib/ass-renderer"
import { backdropUrl, posterUrl, type Movie } from "@/lib/data"
import { clearWatchProgress, getWatchProgress, saveWatchProgress } from "@/lib/watch-progress"
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
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

const VIDEO_API_PREFIX = "/api/local-video/"
const THUMBNAIL_API_PREFIX = "/api/local-thumbnail/"
const THUMBNAIL_PREGEN_API_PREFIX = "/api/local-thumbnail-pregenerate/"
const OFF_VALUE = "off"
const SEEK_RELOAD_DEBOUNCE_MS = 250
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const CONTROLS_IDLE_MS = 2800
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

interface LocalVideoPlayerProps {
  src: string
  title: string
  nextEpisode?: Movie | null
  onPlayNext?: (movie: Movie) => void
  // Identity for "Continue Watching": contentId is this exact movie/episode's
  // own id (what progress is saved and resumed against); seriesId is the
  // parent show's id, set only when playing an episode, so every episode of
  // one series collapses into a single home-page card.
  contentId?: string
  seriesId?: string
}

export default function LocalVideoPlayer({
  src,
  title,
  nextEpisode = null,
  onPlayNext,
  contentId,
  seriesId,
}: LocalVideoPlayerProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const lastProgressSaveAtRef = useRef(0)

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

  useMediaSync(videoRef, audioRef, audioOffsetRef, true, debugSync)

  // Any real seek — scrub bar, chapter jump, anything that moves video.currentTime —
  // needs a fresh audio stream from the new position. This is a native listener on
  // the video element itself (not tied to our own UI handlers) so it covers every
  // way currentTime can change, per the "don't special-case one interaction" brief.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let debounceId: number | null = null
    const onSeeking = () => {
      audioRef.current?.pause()
    }
    const onSeeked = () => {
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
  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return
    let recoverTimer: number | null = null
    const scheduleRecover = () => {
      if (recoverTimer !== null) return
      recoverTimer = window.setTimeout(() => {
        recoverTimer = null
        if (!audioInitializedRef.current || video.paused || video.seeking) return
        reloadAudio(video.currentTime, selectedAudioRef.current)
      }, 600)
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
    audio.addEventListener("stalled", onStalled)
    audio.addEventListener("ended", onAudioEnded)
    audio.addEventListener("playing", onAudioPlaying)
    return () => {
      cancelRecover()
      audio.removeEventListener("stalled", onStalled)
      audio.removeEventListener("ended", onAudioEnded)
      audio.removeEventListener("playing", onAudioPlaying)
    }
  }, [reloadAudio])

  const handleAudioChange = useCallback((value: string) => {
    const idx = Number(value)
    setSelectedAudio(idx)
    const video = videoRef.current
    reloadAudio(video?.currentTime ?? 0, idx)
  }, [reloadAudio])

  const handleSubtitleChange = useCallback((value: string) => {
    setSelectedSubtitle(value === OFF_VALUE ? null : Number(value))
  }, [])

  // ---- Subtitles: native <track> for plain text formats, JASSUB for ASS/SSA styling ----
  const subtitleOptions = info?.subtitleTracks || []
  const vttSubtitles = useMemo(() => subtitleOptions.filter((s) => s.format !== "ass"), [subtitleOptions])
  const selectedSubtitleTrack = subtitleOptions.find((s) => s.index === selectedSubtitle) || null
  const isAssSubtitle = selectedSubtitleTrack?.format === "ass"

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    for (let i = 0; i < video.textTracks.length; i++) {
      const meta = vttSubtitles[i]
      const shouldShow = !isAssSubtitle && meta?.index === selectedSubtitle
      video.textTracks[i].mode = shouldShow ? "showing" : "disabled"
    }
  }, [selectedSubtitle, isAssSubtitle, vttSubtitles])

  const assSubUrl = isAssSubtitle && relPath && selectedSubtitleTrack
    ? `/api/local-subtitle-raw/${encodeURIComponent(relPath)}?stream=${selectedSubtitleTrack.index}`
    : null
  const fontUrls = useMemo(
    () => relPath
      ? (info?.fonts || []).map((f) => `/api/local-font/${encodeURIComponent(relPath)}?attachment=${f.index}&filename=${encodeURIComponent(f.filename)}`)
      : [],
    [info, relPath]
  )
  useAssSubtitle(videoRef, assSubUrl, fontUrls)

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
    else video.pause()
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

  const audioOptions = info?.audioTracks || []
  const portalContainer = fullscreen ? containerRef.current : undefined
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const chromeVisible = showControls || !playing || buffering

  return (
    <ContextMenu>
    <ContextMenuTrigger asChild>
    <div
      ref={containerRef}
      className={cn("group relative h-full w-full overflow-hidden bg-black", playing && !showControls && "cursor-none")}
      onMouseMove={registerActivity}
      onTouchStart={registerActivity}
    >
      <video
        ref={videoRef}
        src={src}
        title={title}
        className="h-full w-full"
        muted
        playsInline
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          const video = videoRef.current
          if (video && contentId) {
            lastProgressSaveAtRef.current = Date.now()
            saveWatchProgress(contentId, video.currentTime, video.duration || duration, seriesId)
          }
        }}
        onWaiting={() => setBuffering(true)}
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
      >
        {vttSubtitles.map((sub, idx) => (
          <track
            key={sub.index}
            kind="subtitles"
            src={relPath ? `/api/local-subtitle/${encodeURIComponent(relPath)}?stream=${sub.index}` : undefined}
            srcLang={sub.language || "und"}
            label={trackLabel(sub, `${t("player.subtitles")} ${idx + 1}`)}
          />
        ))}
      </video>

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
            <Button variant="ghost" size="icon" className="rounded-md text-white hover:bg-white/10 hover:text-white" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Next episode — countdown card in the closing seconds, auto-advance on end */}
      {showNextCard && nextEpisode && (
        <div className="absolute bottom-24 right-3 z-30 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-lg bg-neutral-950/95 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl animate-scale-in sm:bottom-28 sm:right-6 sm:w-80">
          <button
            onClick={dismissNextEpisode}
            aria-label={t("player.cancelAutoplay")}
            className="absolute right-2 top-2 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
          <button onClick={playNextNow} className="group block w-full cursor-pointer text-left">
            <div className="relative aspect-video w-full overflow-hidden bg-neutral-900">
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
                <div className="flex size-11 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-110">
                  <Play className="ml-0.5 size-4" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {t("player.nextEpisodeIn", { seconds: nextCountdown })}
              </p>
              <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">
                {nextEpisode.episodeTitle || nextEpisode.title}
              </p>
              {Boolean(nextEpisode.seasonNumber || nextEpisode.episodeNumber) && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  {t("player.seasonEpisode", {
                    season: nextEpisode.seasonNumber || 1,
                    episode: nextEpisode.episodeNumber || 0,
                  })}
                </p>
              )}
              {(nextEpisode.episodeSynopsis || nextEpisode.description) && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-400">
                  {nextEpisode.episodeSynopsis || nextEpisode.description}
                </p>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
    </ContextMenuTrigger>

    <ContextMenuContent container={portalContainer} className="w-56 border-neutral-800 bg-neutral-950 text-neutral-200">
      <ContextMenuSub>
        <ContextMenuSubTrigger className="text-xs focus:bg-neutral-800 focus:text-white">
          <Gauge className="size-4" />
          {t("player.speed")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent container={portalContainer} className="border-neutral-800 bg-neutral-950 text-neutral-200">
          <ContextMenuRadioGroup value={String(rate)} onValueChange={handleRateChange}>
            {PLAYBACK_RATES.map((r) => (
              <ContextMenuRadioItem key={r} value={String(r)} className="text-xs focus:bg-neutral-800 focus:text-white">
                {r}x
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      {audioOptions.length > 1 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger className="text-xs focus:bg-neutral-800 focus:text-white">
            <Languages className="size-4" />
            {t("player.audio")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent container={portalContainer} className="border-neutral-800 bg-neutral-950 text-neutral-200">
            <ContextMenuRadioGroup value={String(selectedAudio)} onValueChange={handleAudioChange}>
              {audioOptions.map((track, idx) => (
                <ContextMenuRadioItem key={track.index} value={String(track.index)} className="text-xs focus:bg-neutral-800 focus:text-white">
                  {trackLabel(track, `${t("player.audio")} ${idx + 1}`)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {subtitleOptions.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger className="text-xs focus:bg-neutral-800 focus:text-white">
            <SubtitlesIcon className="size-4" />
            {t("player.subtitles")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent container={portalContainer} className="border-neutral-800 bg-neutral-950 text-neutral-200">
            <ContextMenuRadioGroup value={selectedSubtitle === null ? OFF_VALUE : String(selectedSubtitle)} onValueChange={handleSubtitleChange}>
              <ContextMenuRadioItem value={OFF_VALUE} className="text-xs focus:bg-neutral-800 focus:text-white">
                {t("player.off")}
              </ContextMenuRadioItem>
              {subtitleOptions.map((track, idx) => (
                <ContextMenuRadioItem key={track.index} value={String(track.index)} className="text-xs focus:bg-neutral-800 focus:text-white">
                  {trackLabel(track, `${t("player.subtitles")} ${idx + 1}`)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
    </ContextMenuContent>
    </ContextMenu>
  )
}
