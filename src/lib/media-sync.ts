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
// Seeking is deliberately NOT handled here: a real seek can jump far outside the
// currently-buffered audio stream, which requires requesting a brand new stream (see
// LocalVideoPlayer's reloadAudio) rather than a plain currentTime nudge. This hook
// only owns *continuous* sync — play/pause propagation and drift correction — and the
// owner is expected to pause the audio element itself while a seek-triggered reload
// is in flight.
import { useEffect } from "react"

const HARD_DRIFT_SECONDS = 0.25 // beyond this, snap audio.currentTime to match video
const SOFT_DRIFT_SECONDS = 0.08 // beyond this, nudge playbackRate briefly instead of jumping
const SOFT_CORRECTION_RATE = 0.06 // +/- 6% playback speed while nudging back into sync
const SOFT_CORRECTION_MAX_MS = 2000
const DEBUG_LOG_INTERVAL_MS = 2000

export function useMediaSync(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  audioRef: React.RefObject<HTMLAudioElement | null>,
  offsetRef: React.RefObject<number>,
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
    const onPause = () => audio.pause()
    // Chromium throttles decode on a <video> that's both muted and not visible
    // (backgrounded/minimized tab) to save power — since this video is always
    // muted (it's just the sync clock; real sound is `audio`), that throttling
    // makes it stall and refire "waiting" repeatedly even though nothing is
    // actually broken. Pausing the real, audible audio track in response would
    // silence playback for the whole time the tab is hidden. Audio elements
    // aren't subject to that same throttling, so just let it keep playing —
    // onTimeUpdate's hard-drift correction resyncs it in one tick once the tab
    // is visible again and the video's timeupdate events resume.
    const onWaiting = () => {
      if (document.hidden) return
      audio.pause()
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

      if (absDrift > HARD_DRIFT_SECONDS) {
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
    video.addEventListener("waiting", onWaiting)
    video.addEventListener("playing", onPlaying)
    video.addEventListener("ratechange", onRateChange)
    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("ended", onEnded)

    return () => {
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("ratechange", onRateChange)
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("ended", onEnded)
      stopSoftCorrection()
    }
  }, [videoRef, audioRef, offsetRef, enabled, debug])
}
