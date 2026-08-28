// MediaSyncManager — keeps a secondary <audio> element locked to a <video> element's
// currentTime. The video is always the master clock: it does native, byte-range
// seekable playback, and native subtitle cue timing reads its currentTime directly.
// The audio element is a separate network stream (one ffmpeg-transcoded track) that
// has to be kept in step manually, since browsers don't expose a way to swap a
// <video>'s own embedded audio track.
//
// Every audio stream starts its own internal clock at zero regardless of *when* in
// the movie it begins (the server normalizes timestamps with -avoid_negative_ts), so
// this hook is given `offsetRef` — the absolute movie time the *current* audio
// stream's zero-point corresponds to — and always reasons in "absolute" time as
// `offsetRef.current + audio.currentTime`.
//
// Background-tab behaviour (the "why is it not seamless like YouTube" problem):
// Chromium throttles — and often outright pauses — a *muted* <video> in a hidden
// tab to save power. Our video is always muted (it's just the clock; real sound is
// `audio`, which stays audible and is therefore never throttled). So the model is:
//   - The audio element is the source of truth for "where playback actually is".
//   - A pause/stall on the *video* is only honoured when the user actually asked
//     for it (`intentPlayingRef` is false). A browser-imposed one is ignored — the
//     audio keeps playing untouched.
//   - When the tab becomes visible again, the video is snapped to the audio's
//     position and resumed. That catch-up is a single frame, not an audible gap.
//
// Seeking is deliberately NOT handled here: a real seek can jump far outside the
// currently-buffered audio stream, which requires requesting a brand new stream (see
// LocalVideoPlayer's reloadAudio) rather than a plain currentTime nudge. This hook
// only owns *continuous* sync — play/pause propagation and drift correction.
import { useEffect } from "react"

// Beyond this, jump-correct instead of nudging: catch the (muted, silent) video up
// when audio is ahead, or jump audio forward when it's behind. Never drag audio
// backward — the video is the disposable clock, the audio is what's actually heard.
const HARD_DRIFT_SECONDS = 0.25
const SOFT_DRIFT_SECONDS = 0.08 // beyond this, nudge playbackRate briefly instead of jumping
const SOFT_CORRECTION_RATE = 0.06 // +/- 6% playback speed while nudging back into sync
const SOFT_CORRECTION_MAX_MS = 2000
const DEBUG_LOG_INTERVAL_MS = 2000

export function useMediaSync(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  audioRef: React.RefObject<HTMLAudioElement | null>,
  offsetRef: React.RefObject<number>,
  intentPlayingRef: React.RefObject<boolean>,
  enabled: boolean,
  debug = false
) {
  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio || !enabled) return

    let softCorrecting = false
    let softCorrectionTimer: number | null = null
    let lastLogAt = 0

    const stopSoftCorrection = () => {
      if (softCorrectionTimer !== null) {
        window.clearTimeout(softCorrectionTimer)
        softCorrectionTimer = null
      }
      if (softCorrecting) {
        audio.playbackRate = video.playbackRate
        softCorrecting = false
      }
    }

    const resumeIfPlaying = () => {
      if (!video.paused && !video.ended) audio.play().catch(() => {})
    }

    const onPlay = () => resumeIfPlaying()

    // Only mirror a pause the user actually asked for. A hidden/throttled tab
    // pausing the muted clock-video on its own (or a transient "waiting" while it
    // re-buffers) must never silence the still-audible audio — drift correction
    // and the visibility resync below put the video back in step.
    const onPause = () => {
      if (intentPlayingRef.current) return
      audio.pause()
      stopSoftCorrection()
    }

    // Coming back to a visible tab: the video may be frozen seconds behind (or
    // paused outright) while the audio kept playing. Snap the video to where the
    // audio actually is and resume it — deferred a frame so the browser has
    // lifted its background decode throttle first. One-frame catch-up, no gap.
    const onVisibilityChange = () => {
      if (document.hidden || !intentPlayingRef.current) return
      requestAnimationFrame(() => {
        if (document.hidden || audio.paused || audio.ended) return
        const target = offsetRef.current + audio.currentTime
        if (Math.abs(video.currentTime - target) > SOFT_DRIFT_SECONDS) {
          try {
            video.currentTime = target
          } catch {
            // Ignore — onTimeUpdate's drift correction will catch it up.
          }
        }
        if (video.paused && !video.ended) video.play().catch(() => {})
      })
    }

    const onPlaying = () => resumeIfPlaying()
    const onRateChange = () => {
      if (!softCorrecting) audio.playbackRate = video.playbackRate
    }
    const onEnded = () => audio.pause()

    const onTimeUpdate = () => {
      if (video.paused || video.seeking) return
      if (audio.readyState < 2 || audio.paused) return

      const audioAbsolute = offsetRef.current + audio.currentTime
      const drift = audioAbsolute - video.currentTime
      const absDrift = Math.abs(drift)

      if (drift > HARD_DRIFT_SECONDS) {
        // Audio is ahead — the video (muted, so a jump is silent and barely
        // visible) fell behind, typically coming back from a throttled hidden
        // tab. Always catch the video up to where the listener actually is,
        // never drag the audible audio backward through what was already heard.
        stopSoftCorrection()
        try {
          video.currentTime = audioAbsolute
        } catch {
          // Ignore — next tick retries.
        }
      } else if (drift < -HARD_DRIFT_SECONDS) {
        // Audio is behind by more than a soft nudge can fix — jump it forward.
        // Unavoidably a touch audible, but it's the only track that can't just
        // be re-seeked for free.
        stopSoftCorrection()
        const target = video.currentTime - offsetRef.current
        if (target >= 0) {
          try {
            audio.currentTime = target
          } catch {
            // Ignore — next tick retries, or the owner reloads on a bigger jump.
          }
        }
      } else if (absDrift > SOFT_DRIFT_SECONDS) {
        softCorrecting = true
        audio.playbackRate = video.playbackRate * (1 - Math.sign(drift) * SOFT_CORRECTION_RATE)
        if (softCorrectionTimer !== null) window.clearTimeout(softCorrectionTimer)
        softCorrectionTimer = window.setTimeout(stopSoftCorrection, SOFT_CORRECTION_MAX_MS)
      } else if (softCorrecting) {
        stopSoftCorrection()
      }

      if (debug) {
        const now = performance.now()
        if (now - lastLogAt > DEBUG_LOG_INTERVAL_MS) {
          lastLogAt = now
          // eslint-disable-next-line no-console
          console.debug(
            `[MediaSync] videoTime: ${video.currentTime.toFixed(3)}  audioTime: ${audioAbsolute.toFixed(3)}  drift: ${drift.toFixed(3)}`
          )
        }
      }
    }

    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("playing", onPlaying)
    video.addEventListener("ratechange", onRateChange)
    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("ended", onEnded)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("ratechange", onRateChange)
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("ended", onEnded)
      stopSoftCorrection()
    }
  }, [videoRef, audioRef, offsetRef, intentPlayingRef, enabled, debug])
}
