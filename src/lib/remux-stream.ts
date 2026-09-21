// Plays files the browser can't open natively (MPEG-TS/.m2ts, AVI, …) by feeding a
// <video> element through Media Source Extensions from the dev server's live remux
// endpoint (/api/local-remux/…, see streamRemux in scripts/local-media-server.mjs).
//
// The server sends one fragmented MP4 that already contains the picture and the
// chosen audio track, produced by a single ffmpeg process on a single timeline. That
// is the whole point: the browser plays both from the same media element, so audio,
// video (and anything timed off video.currentTime — subtitles, progress, the seek bar)
// cannot drift apart or start at different moments, and there is no second element
// to keep in lockstep.
//
// The stream is linear (ffmpeg can't jump around a pipe), so this controller owns
// everything a byte-range-seekable file would give for free:
//   - Backpressure. It only reads from the network while the buffer ahead of the
//     playhead is below a budget. When it stops reading, the HTTP pipe fills, the
//     server's ffmpeg blocks, and the source file stops being read — no runaway
//     download or memory growth on a 30 GB movie.
//   - Eviction. Data well behind the playhead is dropped so the SourceBuffer never
//     approaches the browser's quota.
//   - Seeking. A seek inside what is already buffered is native and instant. A seek
//     anywhere else starts a fresh stream at the target (a new ffmpeg process,
//     typically playing again within a second) and discards the old buffer.
//   - Timeline. Timestamps in the stream are the container's own (which for MPEG-TS
//     start at e.g. 0.54s, not 0); `timestampOffset` maps them back so
//     video.currentTime is always plain movie time.

// How much of the media may sit buffered ahead of the playhead, in bytes. The
// buffer length in seconds is derived from the stream's measured bitrate, so a
// 40 Mbps remux and a 4 Mbps one both stay around this much RAM.
const AHEAD_BUDGET_BYTES = 96 * 1024 * 1024
const AHEAD_MIN_S = 8
const AHEAD_MAX_S = 40
const AHEAD_DEFAULT_S = 20
// Data further than this behind the playhead is evicted (keeps rewind snappy).
const BEHIND_KEEP_S = 12
// Coalesce network chunks (usually 16–64 KB) into fewer, larger appends.
const APPEND_MIN_BYTES = 256 * 1024
const BACKPRESSURE_POLL_MS = 400
const MAX_RETRIES = 3
const MAX_INIT_BYTES = 4 * 1024 * 1024

export interface RemuxStreamOptions {
  /** Path of the file relative to the library root (already URL-decoded). */
  relPath: string
  /** Movie length in seconds (from ffprobe) — MP4 fragments carry no total duration. */
  duration: number
  /** Container clock origin in seconds (`startTime` from video-info). */
  startTime: number
  /** Called when the stream fails for good (after retries). */
  onError?: (message: string) => void
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

// The init segment is `ftyp` + `moov`. Returns its byte length once both boxes are
// completely present in `bytes`, or null while more data is needed.
function initSegmentLength(bytes: Uint8Array): number | null {
  let offset = 0
  let sawMoov = false
  while (offset + 8 <= bytes.length) {
    const size = readU32(bytes, offset)
    // A box is [4-byte size][4-byte type][payload]: the type sits at offset + 4.
    const type = boxType(bytes, offset + 4)
    if (size < 8) return null
    if (offset + size > bytes.length) return null
    offset += size
    if (type === "moov") {
      sawMoov = true
      break
    }
  }
  return sawMoov ? offset : null
}

function indexOfFourCC(bytes: Uint8Array, fourcc: string, from = 0): number {
  const a = fourcc.charCodeAt(0)
  const b = fourcc.charCodeAt(1)
  const c = fourcc.charCodeAt(2)
  const d = fourcc.charCodeAt(3)
  for (let i = from; i + 4 <= bytes.length; i++) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return i
  }
  return -1
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0")

// Builds the MSE mime type straight from the init segment: the exact avc1.PPCCLL
// string comes from the stream's own avcC record, so it's right for a copied Blu-ray
// (High@4.1) and a re-encoded stream alike. Audio, when present, is always AAC-LC.
function mimeFromInit(init: Uint8Array): string {
  const avcC = indexOfFourCC(init, "avcC")
  if (avcC < 0) throw new Error("Init segment has no H.264 track")
  const codecs = [`avc1.${hex2(init[avcC + 5])}${hex2(init[avcC + 6])}${hex2(init[avcC + 7])}`]
  if (indexOfFourCC(init, "mp4a") >= 0) codecs.push("mp4a.40.2")
  return `video/mp4; codecs="${codecs.join(",")}"`
}

// `localStorage["flick:debug-remux"] = "1"` traces the stream lifecycle in the console.
const DEBUG =
  typeof window !== "undefined" &&
  (() => {
    try {
      return window.localStorage.getItem("flick:debug-remux") === "1"
    } catch {
      return false
    }
  })()
const log = (...args: unknown[]) => {
  if (DEBUG) console.debug("[RemuxStream]", ...args)
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export class RemuxStream {
  private video: HTMLVideoElement
  private opts: RemuxStreamOptions
  private mediaSource: MediaSource
  private objectUrl: string
  private sourceBuffer: SourceBuffer | null = null
  private mime = ""
  private opened: Promise<void>
  private generation = 0
  private abortController: AbortController | null = null
  private audioIndex = 0
  private destroyed = false
  // The position a fresh stream was asked to start at, until its first data lands.
  // Setting video.currentTime to it fires a `seeking` event we must not treat as a
  // user seek (which would restart the stream we just started).
  private ignoreSeekNear: { time: number; until: number } | null = null
  private bytesPerSecond = 0
  private streamBytes = 0
  private streamFirstStart = 0
  private retries = 0

  constructor(video: HTMLVideoElement, opts: RemuxStreamOptions) {
    this.video = video
    this.opts = opts
    this.mediaSource = new MediaSource()
    this.objectUrl = URL.createObjectURL(this.mediaSource)
    this.opened = new Promise((resolve) => {
      this.mediaSource.addEventListener("sourceopen", () => resolve(), { once: true })
    })
    video.addEventListener("seeking", this.onSeeking)
    video.src = this.objectUrl
  }

  /** Begin (or restart) streaming at `at` seconds of movie time with audio track `audio`. */
  start(at: number, audio: number) {
    if (this.destroyed) return
    this.audioIndex = audio
    this.retries = 0
    void this.restart(Math.max(0, at))
  }

  /** Switch the audio track, keeping the current position. Costs one stream restart. */
  setAudioTrack(audio: number) {
    if (this.destroyed || audio === this.audioIndex) return
    this.audioIndex = audio
    this.retries = 0
    void this.restart(this.video.currentTime)
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.generation++
    this.abortController?.abort()
    this.video.removeEventListener("seeking", this.onSeeking)
    this.video.removeAttribute("src")
    try {
      this.video.load()
    } catch {
      // Element already torn down.
    }
    URL.revokeObjectURL(this.objectUrl)
  }

  // ---- seeking ----

  private onSeeking = () => {
    if (this.destroyed) return
    const target = this.video.currentTime
    const ignore = this.ignoreSeekNear
    if (ignore && performance.now() < ignore.until && Math.abs(target - ignore.time) < 0.75) return
    if (this.isBuffered(target)) return
    this.retries = 0
    void this.restart(target)
  }

  private isBuffered(time: number): boolean {
    const ranges = this.video.buffered
    for (let i = 0; i < ranges.length; i++) {
      if (time >= ranges.start(i) - 0.05 && time <= ranges.end(i)) return true
    }
    return false
  }

  // ---- lifecycle of one stream ----

  private async restart(at: number) {
    const generation = ++this.generation
    this.abortController?.abort()
    const controller = new AbortController()
    this.abortController = controller

    // Land the playhead on the requested position now; the picture appears as soon
    // as the first fragments arrive.
    this.ignoreSeekNear = { time: at, until: performance.now() + 4000 }
    if (Math.abs(this.video.currentTime - at) > 0.001) {
      try {
        this.video.currentTime = at
      } catch {
        // Before metadata the browser just records it as the start position.
      }
    }

    try {
      await this.opened
      if (generation !== this.generation) return
      await this.resetBuffer(generation)
      if (generation !== this.generation) return
      await this.pump(generation, at, controller)
    } catch (error) {
      log("stream failed", error)
      if (generation !== this.generation || this.destroyed) return
      this.fail(generation, at, error)
    }
  }

  private fail(generation: number, at: number, error: unknown) {
    if (this.retries < MAX_RETRIES) {
      this.retries++
      window.setTimeout(() => {
        if (generation === this.generation && !this.destroyed) void this.restart(this.video.currentTime || at)
      }, 600 * this.retries)
      return
    }
    this.opts.onError?.(error instanceof Error ? error.message : String(error))
  }

  // Empties the SourceBuffer (if one exists) so a new stream can begin cleanly.
  private async resetBuffer(generation: number) {
    const sb = this.sourceBuffer
    if (!sb) return
    await this.whenIdle(sb)
    if (generation !== this.generation) return
    // remove() re-opens a MediaSource that already ended; abort() is only legal
    // on an open one, so it has to come second.
    const end = Math.max(this.opts.duration || 0, this.mediaSource.duration || 0, 1e6)
    if (sb.buffered.length > 0) {
      sb.remove(0, end)
      await this.whenIdle(sb)
    }
    if (generation !== this.generation) return
    if (this.mediaSource.readyState === "open") {
      try {
        sb.abort()
      } catch {
        // Nothing pending to abort.
      }
    }
  }

  private whenIdle(sb: SourceBuffer): Promise<void> {
    if (!sb.updating) return Promise.resolve()
    return new Promise((resolve) => {
      sb.addEventListener("updateend", () => resolve(), { once: true })
    })
  }

  private async pump(generation: number, at: number, controller: AbortController) {
    const params = new URLSearchParams({ start: at.toFixed(3), audio: String(this.audioIndex) })
    const response = await fetch(`/api/local-remux/${encodeURIComponent(this.opts.relPath)}?${params}`, {
      signal: controller.signal,
    })
    if (!response.ok || !response.body) {
      throw new Error((await response.text().catch(() => "")) || `HTTP ${response.status}`)
    }
    log("response ok, reading", { at, audio: this.audioIndex })
    const reader = response.body.getReader()

    let head: Uint8Array = new Uint8Array(0)
    let initialised = false
    let queue: Uint8Array[] = []
    let queued = 0
    let firstAppendDone = false
    this.streamBytes = 0

    const flush = async () => {
      if (queued === 0) return
      const data = queue.length === 1 ? queue[0] : queue.reduce((acc, chunk) => concat(acc, chunk), new Uint8Array(0))
      queue = []
      queued = 0
      await this.append(generation, data)
      if (generation !== this.generation) return
      if (!firstAppendDone) {
        firstAppendDone = true
        this.afterFirstAppend(at)
      }
      this.updateBitrate()
      this.evictBehind()
    }

    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (error) {
          if (generation !== this.generation) return
          // The server drops the connection when ffmpeg exits with an error. That
          // is routine at the very tail of a slightly-damaged file (the last packet
          // is truncated but everything before it played), so past the point where
          // the movie is essentially over, treat it as a normal end.
          if (this.bufferedEnd() >= this.opts.duration - 30 && this.opts.duration > 0) break
          throw error
        }
        const { done, value } = chunk
        if (generation !== this.generation) return
        if (done) break
        if (!value || value.length === 0) continue

        if (!initialised) {
          head = concat(head, value)
          const length = initSegmentLength(head)
          if (length === null) {
            // A real init segment is a few KB. Far past that with no `moov` means the
            // server sent something else (an error page, the wrong format): fail
            // instead of buffering the whole response in memory.
            if (head.length > MAX_INIT_BYTES) throw new Error("Stream has no init segment")
            continue
          }
          await this.initialiseBuffer(generation, head.subarray(0, length))
          if (generation !== this.generation) return
          initialised = true
          const rest = head.subarray(length)
          if (rest.length > 0) {
            queue.push(rest)
            queued += rest.length
          }
          head = new Uint8Array(0)
        } else {
          queue.push(value)
          queued += value.length
        }
        this.streamBytes += value.length

        if (queued >= APPEND_MIN_BYTES) {
          await flush()
          if (generation !== this.generation) return
          await this.waitForRoom(generation)
          if (generation !== this.generation) return
        }
      }
      await flush()
    } finally {
      // Stop the download the moment this stream is superseded or fails.
      if (generation !== this.generation) reader.cancel().catch(() => {})
    }
    if (generation !== this.generation) return
    this.finish(generation, at)
  }

  private bufferedEnd(): number {
    const ranges = this.sourceBuffer?.buffered
    return ranges && ranges.length > 0 ? ranges.end(ranges.length - 1) : 0
  }

  private finish(generation: number, at: number) {
    const sb = this.sourceBuffer
    if (!sb) throw new Error("Stream ended before the init segment")
    const bufferedEnd = this.bufferedEnd()
    const total = this.opts.duration
    // Ended far short of the movie's end without any error: the source was cut off
    // (or ffmpeg skipped the rest). Pick the movie back up from where the viewer is
    // rather than silently freezing.
    if (total > 0 && bufferedEnd < total - 60) {
      throw new Error(`Stream ended early at ${bufferedEnd.toFixed(1)}s of ${total.toFixed(1)}s (started at ${at.toFixed(1)}s)`)
    }
    void this.whenIdle(sb).then(() => {
      if (generation === this.generation && this.mediaSource.readyState === "open") {
        try {
          this.mediaSource.endOfStream()
        } catch {
          // Already ended/closed.
        }
      }
    })
  }

  // First init segment creates the SourceBuffer; later ones (a restart) reuse it.
  private async initialiseBuffer(generation: number, init: Uint8Array) {
    const mime = mimeFromInit(init)
    log("init segment", init.length, "bytes,", mime)
    if (this.sourceBuffer && mime !== this.mime) {
      // Codecs changed (e.g. the file has no audio on this track): rebuild the buffer.
      await this.whenIdle(this.sourceBuffer)
      try {
        this.mediaSource.removeSourceBuffer(this.sourceBuffer)
      } catch {
        // Already gone.
      }
      this.sourceBuffer = null
    }
    if (!this.sourceBuffer) {
      if (!MediaSource.isTypeSupported(mime)) throw new Error(`Browser can't play ${mime}`)
      const sb = this.mediaSource.addSourceBuffer(mime)
      sb.mode = "segments"
      this.sourceBuffer = sb
      this.mime = mime
      if (this.opts.duration > 0) this.mediaSource.duration = this.opts.duration
    }
    const sb = this.sourceBuffer
    await this.whenIdle(sb)
    // Stream timestamps are the container's raw clock; shift them to movie time.
    sb.timestampOffset = -this.opts.startTime
    await this.append(generation, init)
  }

  private append(generation: number, data: Uint8Array): Promise<void> {
    const sb = this.sourceBuffer
    if (!sb) return Promise.reject(new Error("No SourceBuffer"))
    const attempt = async (): Promise<void> => {
      for (let tries = 0; ; tries++) {
        if (generation !== this.generation || this.destroyed) return
        await this.whenIdle(sb)
        if (generation !== this.generation || this.destroyed) return
        try {
          await new Promise<void>((resolve, reject) => {
            const onEnd = () => {
              sb.removeEventListener("error", onError)
              resolve()
            }
            const onError = () => {
              sb.removeEventListener("updateend", onEnd)
              reject(new Error("SourceBuffer append failed"))
            }
            sb.addEventListener("updateend", onEnd, { once: true })
            sb.addEventListener("error", onError, { once: true })
            // Copy into a fresh ArrayBuffer-backed view: appendBuffer wants a plain
            // BufferSource, and `data` may be a subarray of a larger chunk.
            sb.appendBuffer(data.slice().buffer)
          })
          return
        } catch (error) {
          const quota = error instanceof DOMException && error.name === "QuotaExceededError"
          if (!quota || tries >= 40) throw error
          // Out of room: free everything behind the playhead and give playback a
          // moment to consume some of what's ahead, then try again.
          this.evictBehind(true)
          await sleep(250)
        }
      }
    }
    return attempt()
  }

  private afterFirstAppend(requested: number) {
    const sb = this.sourceBuffer
    if (!sb || sb.buffered.length === 0) return
    this.streamFirstStart = sb.buffered.start(0)
    log("first data buffered", sb.buffered.start(0).toFixed(3), "-", sb.buffered.end(0).toFixed(3), "requested", requested)
    // Copying can only cut on a keyframe. If the first one after the (pre-rolled)
    // start is still later than the requested time, there is a gap before it that the
    // playhead would wait on forever — step forward to where data really begins.
    const first = sb.buffered.start(0)
    if (first > requested + 0.05 && this.video.currentTime < first) {
      this.ignoreSeekNear = { time: first, until: performance.now() + 4000 }
      try {
        this.video.currentTime = first
      } catch {
        // Ignore — the browser will retry on the next append.
      }
    }
  }

  // ---- buffer management ----

  private updateBitrate() {
    const sb = this.sourceBuffer
    if (!sb || sb.buffered.length === 0) return
    const seconds = sb.buffered.end(sb.buffered.length - 1) - this.streamFirstStart
    if (seconds >= 4) this.bytesPerSecond = this.streamBytes / seconds
  }

  private aheadLimitSeconds(): number {
    if (this.bytesPerSecond <= 0) return AHEAD_DEFAULT_S
    return Math.min(AHEAD_MAX_S, Math.max(AHEAD_MIN_S, AHEAD_BUDGET_BYTES / this.bytesPerSecond))
  }

  private aheadSeconds(): number {
    const time = this.video.currentTime
    const ranges = this.video.buffered
    for (let i = 0; i < ranges.length; i++) {
      if (time >= ranges.start(i) - 0.3 && time <= ranges.end(i) + 0.3) return Math.max(0, ranges.end(i) - time)
    }
    return 0
  }

  // Pause reading from the network while enough is buffered. Also unblocks on
  // `seeking`/`timeupdate` so playback consuming data (or a seek) resumes it promptly.
  private async waitForRoom(generation: number) {
    while (generation === this.generation && !this.destroyed) {
      if (this.aheadSeconds() < this.aheadLimitSeconds()) return
      await new Promise<void>((resolve) => {
        const done = () => {
          window.clearTimeout(timer)
          this.video.removeEventListener("timeupdate", done)
          this.video.removeEventListener("seeking", done)
          resolve()
        }
        const timer = window.setTimeout(done, BACKPRESSURE_POLL_MS)
        this.video.addEventListener("timeupdate", done, { once: true })
        this.video.addEventListener("seeking", done, { once: true })
      })
    }
  }

  private evictBehind(aggressive = false) {
    const sb = this.sourceBuffer
    if (!sb || sb.updating || sb.buffered.length === 0) return
    const keepFrom = this.video.currentTime - (aggressive ? 2 : BEHIND_KEEP_S)
    const start = sb.buffered.start(0)
    if (keepFrom - start < (aggressive ? 1 : 6)) return
    try {
      sb.remove(start, keepFrom)
    } catch {
      // Raced with an append — the next call retries.
    }
  }
}
