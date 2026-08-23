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
import {
  Pause,
  Play,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Languages,
  Subtitles as SubtitlesIcon,
  Gauge,
} from "lucide-react"

const VIDEO_API_PREFIX = "/api/local-video/"
const OFF_VALUE = "off"
const SEEK_RELOAD_DEBOUNCE_MS = 250
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

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

interface VideoInfo {
  audioTracks: Track[]
  subtitleTracks: Track[]
  fonts: FontRef[]
  duration: number
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

interface LocalVideoPlayerProps {
  src: string
  title: string
}

export default function LocalVideoPlayer({ src, title }: LocalVideoPlayerProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)

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

  const [debugSync] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("flick:debug-sync") === "1"
  )

  useEffect(() => {
    if (!relPath) return
    let cancelled = false
    fetch(`/api/local-video-info?path=${encodeURIComponent(relPath)}`)
      .then((res) => res.json())
      .then((data: VideoInfo) => {
        if (!cancelled) setInfo(data)
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

  const reloadAudio = useCallback((absoluteSeconds: number, trackIndex: number) => {
    const audio = audioRef.current
    if (!audio || !relPath) return
    const generation = ++audioGenerationRef.current
    audio.pause()
    const start = Math.max(0, absoluteSeconds)
    audio.src = `/api/local-audio/${encodeURIComponent(relPath)}?track=${trackIndex}&start=${start.toFixed(3)}`
    audio.load()
    const onReady = () => {
      if (audioGenerationRef.current !== generation) return // a newer switch/seek already won
      audioOffsetRef.current = start
      const video = videoRef.current
      if (video && !video.paused) audio.play().catch(() => {})
    }
    audio.addEventListener("canplay", onReady, { once: true })
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

  // ---- Transport controls ----
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video) return
    if (video.paused) {
      if (!audioInitializedRef.current) {
        audioInitializedRef.current = true
        reloadAudio(video.currentTime, selectedAudioRef.current)
      }
      video.play().catch(() => {})
      audio?.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [reloadAudio])

  const seekTo = useCallback((absoluteSeconds: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.max(0, Math.min(duration || absoluteSeconds, absoluteSeconds))
    video.currentTime = clamped
    setCurrentTime(clamped)
  }, [duration])

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

  const audioOptions = info?.audioTracks || []
  const portalContainer = fullscreen ? containerRef.current : undefined

  return (
    <ContextMenu>
    <ContextMenuTrigger asChild>
    <div ref={containerRef} className="group relative h-full w-full bg-black">
      <video
        ref={videoRef}
        src={src}
        title={title}
        className="h-full w-full"
        muted
        playsInline
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(event) => {
          if (scrubbingRef.current) return
          setCurrentTime(event.currentTarget.currentTime)
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

      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner className="size-8 text-white" />
        </div>
      )}

      {!playing && !buffering && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity"
          aria-label={t("player.trailer")}
        >
          <Play className="size-16 text-white/90" fill="currentColor" />
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 sm:px-4 sm:pb-3">
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
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
        />

        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>

          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={toggleMute}>
            {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            className="hidden h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-white/25 accent-white sm:block"
          />

          <span className="text-xs tabular-nums text-white/80 sm:text-sm">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
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
