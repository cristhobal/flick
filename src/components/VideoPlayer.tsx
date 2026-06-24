"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/I18nProvider"
import { displayLanguage } from "@/i18n/translations"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Subtitles,
  Languages,
} from "lucide-react"

interface VideoPlayerProps {
  onClose?: () => void
}

export default function VideoPlayer(_props: VideoPlayerProps) {
  const { lang, t } = useI18n()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentTime] = useState(0)
  const [duration] = useState(7380)
  const [showControls, setShowControls] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    return `${m}:${String(s).padStart(2, "0")}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleMouseMove = () => {
    setShowControls(true)
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
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

  return (
    <div
      ref={containerRef}
      className="group relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video Placeholder */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-neutral-900 to-black">
        <div className="text-center">
          <div className="mx-auto mb-4 size-16 rounded-full border-2 border-white/20" />
          <p className="text-sm text-neutral-600">Previsualización</p>
        </div>
      </div>

      {/* Center Play Button (when paused) */}
      {!isPlaying && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <button
            onClick={() => setIsPlaying(true)}
            className="flex size-16 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-white backdrop-blur-sm transition-transform hover:scale-110"
          >
            <Play className="ml-1 size-8 fill-white" />
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress Bar */}
        <div className="group/progress relative mx-4 mb-2 h-1 cursor-pointer rounded-full bg-neutral-700 hover:h-1.5">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover/progress:opacity-100"
            style={{ left: `${progress}%`, marginLeft: "-6px" }}
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-2 px-4 pb-4">
          {/* Play/Pause */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/10"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>

          {/* Time */}
          <span className="min-w-[80px] text-xs tabular-nums text-neutral-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/10"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>

          {/* Audio */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/10"
              >
                <Languages className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 border-neutral-800 bg-neutral-950"
            >
              <DropdownMenuLabel className="text-neutral-400">
                {t("player.audio")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-neutral-800" />
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                {displayLanguage("es", lang)}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                {displayLanguage("en", lang)}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                {displayLanguage("ja", lang)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Subtitles */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/10"
              >
                <Subtitles className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 border-neutral-800 bg-neutral-950"
            >
              <DropdownMenuLabel className="text-neutral-400">
                {t("player.subtitles")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-neutral-800" />
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                {t("player.off")}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                {displayLanguage("es", lang)}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                {displayLanguage("en", lang)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/10"
              >
                <Settings className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 border-neutral-800 bg-neutral-950"
            >
              <DropdownMenuLabel className="text-neutral-400">
                Opciones
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-neutral-800" />
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                Velocidad: Normal
              </DropdownMenuItem>
              <DropdownMenuItem className="text-neutral-300 focus:bg-neutral-800 focus:text-white">
                Calidad: Automática
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/10"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize className="size-4" />
            ) : (
              <Maximize className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
