import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import Hls from "hls.js"
import type ASS from "assjs"
import { Button } from "@/components/ui/button"
import type { Movie, EmbeddedTrack } from "@/lib/data"
import { posterUrl, backdropUrl, getGenreGradient, isPlayableMovie } from "@/lib/data"
import { useI18n } from "@/i18n/I18nProvider"
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2,
  Settings, Subtitles, Languages, ChevronLeft, ChevronRight,
} from "lucide-react"

const LANG_LABELS: Record<string, string> = {
  spa: "Español", Español: "Español",
  eng: "English", Inglés: "English",
  jpn: "日本語", Japonés: "日本語",
  fra: "Français", fre: "Français", Francés: "Français",
  kor: "한국어", Coreano: "한국어",
  deu: "Deutsch", ger: "Deutsch", Alemán: "Deutsch",
  ita: "Italiano", Italiano: "Italiano",
  por: "Português", Portugués: "Português",
  zho: "中文", chi: "中文", Chino: "中文",
  rus: "Русский", Ruso: "Русский",
  ara: "العربية", Árabe: "العربية",
  und: "Desconocido",
}

function labelLang(code: string) {
  return LANG_LABELS[code] || code
}

interface SubEntry {
  key: string
  label: string
  src: string
  isEmbedded: boolean
  format: "vtt" | "ass"
}

interface AudioEntry {
  key: string
  label: string
  hlsIndex: number
}

export default function PlayerPage({
  movie, related, episodes, onBack, onPlayMovie,
}: PlayerPageProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const autoPlayNextLoadRef = useRef(false)
  const assRef = useRef<ASS | null>(null)
  const assContainerRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [probedDuration, setProbedDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [showSubMenu, setShowSubMenu] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [activeSub, setActiveSub] = useState("off")
  const [activeAudio, setActiveAudio] = useState("")
  const [playerError, setPlayerError] = useState("")
  const [isPreparing, setIsPreparing] = useState(true)
  const [manifestReady, setManifestReady] = useState(false)
  const [embeddedTracks, setEmbeddedTracks] = useState<{ audio: EmbeddedTrack[]; sub: EmbeddedTrack[] }>({ audio: [], sub: [] })
  const [subtitleText, setSubtitleText] = useState("")

  const isTrailerMode = !movie.videoFile && !!movie.trailerUrl
  const videoSrc = movie.videoFile ? `/media/${encodeURIComponent(movie.videoFile)}` : ""
  const streamSrc = movie.videoFile
    ? `/api/stream/${encodeURIComponent(movie.videoFile)}/master.m3u8`
    : ""

  // Reset state when video source changes
  useEffect(() => {
    setCurrentTime(0)
    setDuration(0)
    setProbedDuration(movie.durationSeconds || 0)
    setActiveSub("off")
    setActiveAudio("")
    setIsPreparing(true)
    setManifestReady(false)
    setPlayerError("")
  }, [movie.videoFile, movie.durationSeconds])
  useEffect(() => {
    if (!movie.videoFile) return
    fetch(`/api/subtracks/${encodeURIComponent(movie.videoFile)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setEmbeddedTracks({ audio: data.audioTracks || [], sub: data.subTracks || [] })
          setProbedDuration(Number(data.durationSeconds) || 0)
        }
      })
      .catch(() => {})
  }, [movie.videoFile])

  // Build subtitle entries: sidecar files + embedded subs
  const subtitleEntries = useCallback((): SubEntry[] => {
    const entries: SubEntry[] = []
    const ASS_EXTS = new Set([".ass", ".ssa"])
    // Sidecar subtitles
    for (const sf of movie.subFiles || []) {
      const fext = sf.file.slice(sf.file.lastIndexOf(".")).toLowerCase()
      entries.push({
        key: `side-${sf.lang}`,
        label: labelLang(sf.lang),
        src: `/subs/${encodeURIComponent(sf.file)}`,
        isEmbedded: false,
        format: ASS_EXTS.has(fext) ? "ass" : "vtt",
      })
    }
    // Embedded subtitles
    const seen = new Set<string>()
    for (const et of embeddedTracks.sub) {
      const lang = et.language || "und"
      const key = `emb-${et.index}`
      if (!seen.has(key)) {
        seen.add(key)
        entries.push({
          key,
          label: et.title ? `${labelLang(lang)} (${et.title})` : labelLang(lang),
          src: `/api/sub-extract/${encodeURIComponent(movie.videoFile || "")}/${et.index}.${et.codec === "ass" || et.codec === "ssa" ? "ass" : "vtt"}`,
          isEmbedded: true,
          format: et.codec === "ass" || et.codec === "ssa" ? "ass" : "vtt",
        })
      }
    }
    // Deduplicate by label
    const seenLabel = new Set<string>()
    return entries.filter((e) => {
      if (seenLabel.has(e.label)) return false
      seenLabel.add(e.label)
      return true
    })
  }, [movie.subFiles, movie.videoFile, embeddedTracks.sub])

  const subs = useMemo(() => subtitleEntries(), [movie.subFiles, movie.videoFile, embeddedTracks.sub])
  const hasSubs = subs.length > 0

  const audioEntries = useCallback((): AudioEntry[] => {
    const tracks = embeddedTracks.audio.length > 0
      ? embeddedTracks.audio
      : movie.embeddedAudio || []

    return tracks.map((track, hlsIndex) => ({
      key: String(track.index),
      label: track.title
        ? `${labelLang(track.language)} (${track.title})`
        : labelLang(track.language),
      hlsIndex,
    }))
  }, [embeddedTracks.audio, movie.embeddedAudio])

  const audioLangs = audioEntries()
  const hasAudioTracks = audioLangs.length > 1
  const currentEpisodeIndex = episodes.findIndex((episode) => episode.id === movie.id)
  const previousEpisode = currentEpisodeIndex > 0
    ? episodes[currentEpisodeIndex - 1]
    : undefined
  const nextEpisode = currentEpisodeIndex >= 0 && currentEpisodeIndex < episodes.length - 1
    ? episodes[currentEpisodeIndex + 1]
    : undefined
  const isEpisodic = Boolean(movie.seriesTitle && episodes.length > 0)

  const playEpisode = (episode: Movie | undefined) => {
    if (!episode || !onPlayMovie) return
    autoPlayNextLoadRef.current = true
    onPlayMovie(episode)
  }

  useEffect(() => {
    if (audioLangs.length > 0 && !activeAudio) {
      setActiveAudio(audioLangs[0].key)
    }
  }, [audioLangs, activeAudio])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !streamSrc) return

    setManifestReady(false)
    setIsPreparing(true)

    const startPlayback = () => {
      if (autoPlayNextLoadRef.current) {
        autoPlayNextLoadRef.current = false
        void vid.play().catch(() => {})
      }
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        startLevel: -1,
        lowLatencyMode: false,
        startPosition: -1,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 20000,
      })
      hlsRef.current = hls
      hls.loadSource(streamSrc)
      hls.attachMedia(vid)

      let recoveryAttempts = 0

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setManifestReady(true)
        vid.currentTime = 0
        // Prefer highest quality immediately
        hls.nextLevel = hls.levels.length - 1
        startPlayback()
      })
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        // Audio switched — ensure we stay at current position
        if (!vid.paused) {
          const pos = vid.currentTime
          requestAnimationFrame(() => { vid.currentTime = pos })
        }
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            recoveryAttempts++
            if (recoveryAttempts > 5) {
              setIsPreparing(false)
              setPlayerError(t("player.prepareError"))
              return
            }
            hls.startLoad()
            break

          case Hls.ErrorTypes.MEDIA_ERROR:
            recoveryAttempts++
            if (recoveryAttempts > 5) {
              setIsPreparing(false)
              setPlayerError(t("player.prepareError"))
              return
            }
            hls.recoverMediaError()
            break

          default:
            setIsPreparing(false)
            setPlayerError(t("player.prepareError"))
            break
        }
      })

      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }

    if (vid.canPlayType("application/vnd.apple.mpegurl")) {
      vid.src = streamSrc
      const onReady = () => {
        setManifestReady(true)
        vid.currentTime = 0
        startPlayback()
      }
      const onError = () => {
        setIsPreparing(false)
        setPlayerError(t("player.hlsError"))
      }
      vid.addEventListener("loadedmetadata", onReady)
      vid.addEventListener("error", onError)
      return () => {
        vid.removeEventListener("loadedmetadata", onReady)
        vid.removeEventListener("error", onError)
      }
    }

    vid.src = videoSrc
    setManifestReady(true)
    vid.currentTime = 0
    setPlayerError(t("player.hlsFallback"))
  }, [streamSrc, videoSrc])

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return "0:00"
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    return `${m}:${String(s).padStart(2, "0")}`
  }

  const totalDuration = probedDuration || movie.durationSeconds || duration
  const progress = totalDuration > 0 ? Math.min((currentTime / totalDuration) * 100, 100) : 0

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimerRef.current)
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isPlaying])

  useEffect(() => {
    return () => clearTimeout(hideTimerRef.current)
  }, [])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const onPlay = () => {
      setIsPlaying(true)
      setIsPreparing(false)
    }
    const onPause = () => setIsPlaying(false)
    const onTime = () => setCurrentTime(vid.currentTime)
    const onMeta = () => setDuration(vid.duration || 0)
    const onEnded = () => setIsPlaying(false)
    vid.addEventListener("play", onPlay)
    vid.addEventListener("pause", onPause)
    vid.addEventListener("timeupdate", onTime)
    vid.addEventListener("loadedmetadata", onMeta)
    vid.addEventListener("ended", onEnded)
    return () => {
      vid.removeEventListener("play", onPlay)
      vid.removeEventListener("pause", onPause)
      vid.removeEventListener("timeupdate", onTime)
      vid.removeEventListener("loadedmetadata", onMeta)
      vid.removeEventListener("ended", onEnded)
    }
  }, [])

  const togglePlay = () => {
    const vid = videoRef.current
    if (!vid) return
    if (vid.paused) { vid.play() } else { vid.pause() }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const vid = videoRef.current
    if (!vid || !totalDuration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    vid.currentTime = ratio * totalDuration
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vid = videoRef.current
    if (!vid) return
    const v = parseFloat(e.target.value)
    vid.volume = v
    setVolume(v)
    setIsMuted(v === 0)
  }

  const toggleMute = () => {
    const vid = videoRef.current
    if (!vid) return
    vid.muted = !vid.muted
    setIsMuted(vid.muted)
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const handleAudioSelect = (entry: AudioEntry) => {
    setActiveAudio(entry.key)
    const hls = hlsRef.current
    if (hls && entry.hlsIndex < hls.audioTracks.length) {
      hls.audioTrack = entry.hlsIndex
    }
    setShowLangMenu(false)
  }

  const handleSubSelect = (key: string) => {
    setActiveSub(key)
    setShowSubMenu(false)
  }

  // Pre-fetch all subtitle VTT files to warm browser cache
  useEffect(() => {
    for (const sub of subs) {
      if (sub.format === "ass") continue
      fetch(sub.src).catch(() => {})
    }
  }, [subs])

  // Create all track elements upfront when subtitle list changes
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const old = vid.querySelectorAll("track[data-dynamic]")
    old.forEach((t) => t.remove())
    for (const sub of subs) {
      if (sub.format === "ass") continue
      const el = document.createElement("track")
      el.setAttribute("data-dynamic", "true")
      el.kind = "subtitles"
      el.label = sub.key
      el.src = sub.src
      vid.appendChild(el)
    }
    // Set active subtitle after tracks are added
    requestAnimationFrame(() => {
      for (let i = 0; i < (vid.textTracks?.length || 0); i++) {
        const t = vid.textTracks[i]
        t.mode = t.label === activeSub ? "showing" : "hidden"
      }
    })
  }, [subs])

  // Toggle active subtitle mode and listen for cue changes (VTT only)
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    // Skip if active sub is ASS format
    const activeEntry = subs.find((s) => s.key === activeSub)
    if (activeEntry?.format === "ass") return

    // Clear any ASS rendering
    if (assRef.current) {
      assRef.current.destroy()
      assRef.current = null
    }

    let currentTrack: TextTrack | null = null

    const readCues = () => {
      if (currentTrack && currentTrack.activeCues && currentTrack.activeCues.length > 0) {
        const text = Array.from(currentTrack.activeCues)
          .map((c) => (c as VTTCue).text)
          .join("\n")
        setSubtitleText(text)
      } else {
        setSubtitleText("")
      }
    }

    // Wait a frame for the DOM <track> elements to be attached
    const timer = setTimeout(() => {
      for (let i = 0; i < (vid.textTracks?.length || 0); i++) {
        const t = vid.textTracks[i]
        if (t.label === activeSub) {
          t.mode = "showing"
          currentTrack = t
          currentTrack.addEventListener("cuechange", readCues)
          readCues()
        } else {
          t.mode = "hidden"
        }
      }
    }, 0)

    return () => {
      clearTimeout(timer)
      if (currentTrack) {
        currentTrack.removeEventListener("cuechange", readCues)
      }
    }
  }, [activeSub, subs])

  // ASS subtitle rendering via assjs (dynamically imported to avoid SSR issues)
  useEffect(() => {
    const activeEntry = subs.find((s) => s.key === activeSub)

    // Destroy previous ASS instance
    if (assRef.current) {
      assRef.current.destroy()
      assRef.current = null
    }

    // Not ASS or disabled — nothing more to do
    if (!activeEntry || activeEntry.format !== "ass") return

    const vid = videoRef.current
    const container = assContainerRef.current
    if (!vid || !container) return

    // Clear VTT subtitle overlay
    setSubtitleText("")

    let cancelled = false

    import("assjs").then((mod) => {
      if (cancelled) return
      const ASS = mod.default
      fetch(activeEntry.src)
        .then((r) => r.text())
        .then((content) => {
          if (cancelled) return
          assRef.current?.destroy()
          assRef.current = new ASS(content, vid, { container })
        })
        .catch(() => {})
    })

    return () => {
      cancelled = true
      if (assRef.current) {
        assRef.current.destroy()
        assRef.current = null
      }
    }
  }, [activeSub, subs])

  const bgSrc = backdropUrl(movie.backdropPath, "original")
  const posterSrc = posterUrl(movie.posterPath, "w342")

  return (
    <div className="min-h-screen bg-black">
      {/* Player */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full bg-black"
        onMouseMove={resetHideTimer}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        {/* Backdrop banner (visible until video starts playing) */}
        {bgSrc && isPreparing && (
          <img
            src={bgSrc}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
          />
        )}

        {/* Hide native subtitle box — assjs or custom overlay takes over */}
        <style>{`
          #player-video::cue {
            color: transparent !important;
            background: transparent !important;
          }
        `}</style>

        {/* Video element */}
        {videoSrc ? (
          <video
            ref={videoRef}
            id="player-video"
            className="absolute inset-0 h-full w-full bg-black/40"
            onClick={togglePlay}
            playsInline
            crossOrigin="anonymous"
            preload="auto"
          />
        ) : movie.trailerUrl ? (
          <iframe
            src={movie.trailerUrl}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; gyroscope; accelerometer"
            allowFullScreen
          />
        ) : (
          <>
            {bgSrc ? (
              <img
                src={bgSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40"
              />
            ) : posterSrc ? (
              <img
                src={posterSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40"
              />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-b ${getGenreGradient(movie.genre)} opacity-60`} />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex size-16 items-center justify-center rounded-full border-2 border-white/20 bg-white/5">
                <Play className="ml-1 size-8 fill-white/60 text-white/60" />
              </div>
            </div>
          </>
        )}

        {/* Container for assjs subtitle rendering */}
        <div
          ref={assContainerRef}
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        />

        {isPreparing && videoSrc && !manifestReady && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
            <Loader2 className="size-8 animate-spin text-neutral-400" />
          </div>
        )}

        {playerError && (
          <div className="absolute top-20 left-1/2 z-40 max-w-md -translate-x-1/2 rounded-lg border border-red-900/60 bg-red-950/90 px-4 py-3 text-center text-xs text-red-100">
            {playerError}
          </div>
        )}

        {/* Series info badge — fades with controls */}
        {movie.seriesTitle && movie.episodeNumber && (
          <div
            className={`absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-neutral-400 backdrop-blur-sm transition-opacity duration-500 ${
              showControls ? "opacity-100" : "opacity-0"
            }`}
          >
            {movie.seriesTitle} — {movie.totalEpisodes ? t("player.episodeOf", { episode: movie.episodeNumber, total: movie.totalEpisodes }) : t("player.episode", { episode: movie.episodeNumber })}
          </div>
        )}

        {/* Top bar */}
        <div
          className={`absolute top-0 right-0 left-0 z-30 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-500 sm:p-6 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <Button
            variant="ghost"
            size="icon"
            className="text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95"
            onClick={onBack}
          >
            <ChevronLeft className="size-6" />
          </Button>
          <span className="text-sm font-medium text-white drop-shadow-lg">
            {movie.episodeTitle || movie.title}
          </span>
          {movie.quality && !isTrailerMode && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-300">
              {movie.quality}
            </span>
          )}
          {isTrailerMode && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-amber-400/80">
              {t("player.trailer")}
            </span>
          )}
        </div>

        {/* Center play button */}
        {!isPlaying && videoSrc && manifestReady && !isTrailerMode && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 animate-fade-in">
            <button
              onClick={togglePlay}
              className="flex size-16 items-center justify-center rounded-full border-2 border-white/40 bg-white/10 text-white backdrop-blur-sm transition-all hover:scale-110 active:scale-95"
            >
              <Play className="ml-1 size-8 fill-white" />
            </button>
          </div>
        )}

        {/* Custom subtitle overlay — positioned above controls */}
        {subtitleText && (
          <div className="pointer-events-none absolute bottom-20 left-1/2 z-30 w-full max-w-[90%] -translate-x-1/2 text-center">
            <div className="inline-block px-3 py-1.5 leading-relaxed text-white [text-shadow:_0_0_4px_#000,_0_0_8px_#000,_0_0_12px_#000,_0_0_16px_#000,_-1px_-1px_0_#000,_1px_-1px_0_#000,_-1px_1px_0_#000,_1px_1px_0_#000]">
              {subtitleText.split("\n").map((line, i) => (
                <p key={i} className="text-balance text-lg font-medium leading-relaxed tracking-wide">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        {!isTrailerMode && (
        <div
          className={`absolute right-0 bottom-0 left-0 z-30 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-500 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="group/progress relative mx-4 mb-3 h-1 cursor-pointer rounded-full bg-neutral-700 transition-all hover:h-1.5 sm:mx-6"
            onClick={handleSeek}
          >
            <div
              className="h-full rounded-full bg-white transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white opacity-0 transition-all group-hover/progress:opacity-100"
              style={{ left: `${progress}%`, marginLeft: "-6px" }}
            />
          </div>

          <div className="flex items-center gap-2 px-4 pb-4 sm:px-6 sm:pb-6">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95"
              onClick={togglePlay}
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </Button>

            <span className="min-w-[80px] text-xs tabular-nums text-neutral-400">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>

            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95"
              onClick={toggleMute}
            >
              {isMuted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 accent-white"
            />

            <div className="flex-1" />

            {/* Audio language selector — always visible */}
            {audioLangs.length > 0 && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95"
                  onClick={() => { setShowLangMenu(!showLangMenu); setShowSubMenu(false) }}
                >
                  <Languages className="size-4" />
                </Button>
                {showLangMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                    <div className="absolute right-0 bottom-full z-50 mb-2 w-44 overflow-hidden rounded-lg bg-neutral-900 shadow-2xl ring-1 ring-white/10">
                      <div className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                        {t("player.audio")}
                      </div>
                      {audioLangs.map((entry) => (
                        <button
                          key={entry.key}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5 ${activeAudio === entry.key ? "text-white" : "text-neutral-300"}`}
                          onClick={() => handleAudioSelect(entry)}
                        >
                          {activeAudio === entry.key && <span className="text-white">✓ </span>}
                          {entry.label}
                        </button>
                      ))}
                      {!hasAudioTracks && (
                        <div className="border-t border-neutral-800 px-3 py-2 text-[10px] text-neutral-600">
                          {t("player.singleAudio")}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Subtitle selector */}
            {hasSubs && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={`text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95 ${activeSub !== "off" ? "text-white" : ""}`}
                  onClick={() => { setShowSubMenu(!showSubMenu); setShowLangMenu(false) }}
                >
                  <Subtitles className="size-4" />
                </Button>
                {showSubMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSubMenu(false)} />
                    <div className="absolute right-0 bottom-full z-50 mb-2 w-48 overflow-hidden rounded-lg bg-neutral-900 shadow-2xl ring-1 ring-white/10">
                      <div className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                        {t("player.subtitles")}
                      </div>
                      <button
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5 ${activeSub === "off" ? "text-white" : "text-neutral-400"}`}
                        onClick={() => handleSubSelect("off")}
                      >
                        {activeSub === "off" && <span className="text-white">✓ </span>}
                        {t("player.off")}
                      </button>
                      {subs.map((sub) => (
                        <button
                          key={sub.key}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5 ${activeSub === sub.key ? "text-white" : "text-neutral-400"}`}
                          onClick={() => handleSubSelect(sub.key)}
                        >
                          {activeSub === sub.key && <span className="text-white">✓ </span>}
                          <span>{sub.label}</span>
                          {sub.isEmbedded && (
                            <span className="ml-auto text-[9px] text-neutral-600">MKV</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95"
            >
              <Settings className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          </div>
        </div>
        )}
      </div>

      {/* Info section */}
      <div className="mx-auto max-w-[1920px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <h1 className="text-2xl font-bold text-white drop-shadow-lg animate-fade-up sm:text-3xl">
              {movie.seriesTitle ? `${movie.seriesTitle}` : movie.title}
            </h1>
            {movie.seriesTitle && movie.episodeNumber && (
              <p className="mt-1 text-sm text-neutral-500 animate-fade-up stagger-1">
                {movie.totalEpisodes ? t("player.episodeOf", { episode: movie.episodeNumber, total: movie.totalEpisodes }) : t("player.episode", { episode: movie.episodeNumber })}: {movie.episodeTitle || movie.title}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-400 animate-fade-up stagger-2">
              <span className="text-white/80">{movie.year}</span>
              <span className="h-4 w-px bg-neutral-700" />
              <span>{movie.duration}</span>
              {movie.quality && (
                <>
                  <span className="h-4 w-px bg-neutral-700" />
                  <span className="text-neutral-500">{movie.quality}</span>
                </>
              )}
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-400 animate-fade-up stagger-3">
              {movie.longDescription}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 animate-fade-up stagger-4">
              {audioLangs.map((entry) => (
                <span
                  key={entry.key}
                  className="rounded-full border border-neutral-800 px-2.5 py-0.5 text-[11px] text-neutral-500"
                >
                  {entry.label}
                </span>
              ))}
            </div>
            {hasSubs && (
              <div className="mt-3 flex flex-wrap gap-1.5 animate-fade-up stagger-5">
                {subs.map((sub) => (
                  <span
                    key={sub.key}
                    className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-500"
                  >
                    {t("player.subtitles")}: {sub.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isEpisodic ? (
            <div className="animate-fade-up">
              <h3 className="mb-3 text-sm font-medium tracking-wider text-neutral-400 uppercase">
                {t("player.episodeNavigation")}
              </h3>
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={!previousEpisode}
                  onClick={() => playEpisode(previousEpisode)}
                  className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronLeft className="size-5 shrink-0" />
                  {previousEpisode && (
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-neutral-800">
                      {posterUrl(previousEpisode.posterPath || movie.posterPath, "w185") ? (
                        <img
                          src={posterUrl(previousEpisode.posterPath || movie.posterPath, "w185") || ""}
                          alt={movie.seriesTitle || movie.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className={`h-full w-full bg-gradient-to-b ${getGenreGradient(movie.genre)}`} />
                      )}
                    </div>
                  )}
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-neutral-500">{t("player.previous")}</span>
                    <span className="block truncate text-sm text-white">
                      {previousEpisode
                        ? `${previousEpisode.episodeNumber}. ${previousEpisode.episodeTitle || previousEpisode.title}`
                        : t("common.noAvailable")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!nextEpisode}
                  onClick={() => playEpisode(nextEpisode)}
                  className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {nextEpisode && (
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-neutral-800">
                      {posterUrl(nextEpisode.posterPath || movie.posterPath, "w185") ? (
                        <img
                          src={posterUrl(nextEpisode.posterPath || movie.posterPath, "w185") || ""}
                          alt={movie.seriesTitle || movie.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className={`h-full w-full bg-gradient-to-b ${getGenreGradient(movie.genre)}`} />
                      )}
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-neutral-500">{t("player.next")}</span>
                    <span className="block truncate text-sm text-white">
                      {nextEpisode
                        ? `${nextEpisode.episodeNumber}. ${nextEpisode.episodeTitle || nextEpisode.title}`
                        : t("common.noAvailable")}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0" />
                </button>
              </div>
            </div>
          ) : related.length > 0 ? (
            <div className="animate-fade-up">
              <h3 className="mb-3 text-sm font-medium tracking-wider text-neutral-400 uppercase">
                {t("player.related")}
              </h3>
              <div className="flex flex-nowrap gap-3 overflow-x-auto lg:flex-col">
                {related.filter(isPlayableMovie).slice(0, 4).map((item) => {
                  const relImg = posterUrl(item.posterPath, "w185")
                  return (
                    <button
                      key={item.id}
                      onClick={() => onPlayMovie?.(item)}
                      className="group/rel flex shrink-0 items-center gap-3 rounded-lg p-2 transition-all hover:bg-neutral-900"
                    >
                      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-neutral-800 transition-transform duration-300 group-hover/rel:scale-105">
                        {relImg ? (
                          <img src={relImg} alt={item.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-neutral-600">
                            <Play className="size-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="truncate text-sm font-medium text-white group-hover/rel:text-neutral-300">
                          {item.title}
                        </p>
                        <p className="text-xs text-neutral-500">{item.year}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface PlayerPageProps {
  movie: Movie
  related: Movie[]
  episodes: Movie[]
  onBack: () => void
  onPlayMovie?: (movie: Movie) => void
}
