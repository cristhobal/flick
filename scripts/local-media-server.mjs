// Dev-only Vite middleware that exposes the local movie library on disk so `npm run dev`
// can browse and stream real files instead of TMDB trailers. Registered with `apply: "serve"`
// so it never runs (and never ships) during `astro build` / production.
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs"
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { extname, join, normalize, relative, resolve, sep } from "node:path"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { homedir } from "node:os"

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"])
const MIME_TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
}

const LIBRARY_FOLDER_NAME = "Peliculas"
const LIBRARY_API_PATH = "/api/local-library"
const VIDEO_API_PREFIX = "/api/local-video/"
const AUDIO_API_PREFIX = "/api/local-audio/"
const VIDEO_INFO_API_PATH = "/api/local-video-info"
const SUBTITLE_API_PREFIX = "/api/local-subtitle/"
const SUBTITLE_RAW_API_PREFIX = "/api/local-subtitle-raw/"
const FONT_API_PREFIX = "/api/local-font/"
const THUMBNAIL_API_PREFIX = "/api/local-thumbnail/"
const THUMBNAIL_PREGEN_API_PREFIX = "/api/local-thumbnail-pregenerate/"
const THUMBNAIL_WIDTH = 320
// Caps how many thumbnails a pregeneration pass produces for one file: the
// interval between frames grows with duration so a 20-minute episode and a
// 3-hour movie both end up with a reasonable, scrub-friendly frame count
// instead of one every 2s regardless of length.
const THUMBNAIL_MIN_INTERVAL_S = 5
const THUMBNAIL_TARGET_COUNT = 300
const CACHE_DIR = resolve(process.cwd(), ".media-cache", "subs")
const FONT_CACHE_DIR = resolve(process.cwd(), ".media-cache", "fonts")
const THUMB_CACHE_DIR = resolve(process.cwd(), ".media-cache", "thumbs")

function thumbnailInterval(duration) {
  if (!duration || duration <= 0) return THUMBNAIL_MIN_INTERVAL_S
  return Math.max(THUMBNAIL_MIN_INTERVAL_S, Math.ceil(duration / THUMBNAIL_TARGET_COUNT))
}
const FONT_MIME_TYPES = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}
// ASS/SSA carry their own full style block; everything else gets converted to plain WebVTT.
const STYLED_SUBTITLE_CODECS = new Set(["ass", "ssa"])

function isVideoFile(name) {
  return VIDEO_EXTENSIONS.has(extname(name).toLowerCase())
}

function stripExt(name) {
  return name.slice(0, name.length - extname(name).length)
}

// "Movie Name (2024)" -> { title: "Movie Name", year: 2024 }
function parseTitleYear(name) {
  const match = name.match(/^(.*?)\s*\((\d{4})\)\s*$/)
  if (match) return { title: match[1].trim(), year: Number(match[2]) }
  return { title: name.trim(), year: 0 }
}

// "E12 - Episode Title" -> { episode: 12, title: "Episode Title" }
// Also handles fractional "special" numbering ("E7.5 - ...") — common for
// recap/OVA episodes — so E7 and E7.5 stay distinct instead of both collapsing
// to episode 7 (which produced duplicate React keys downstream).
function parseEpisode(name) {
  const base = stripExt(name)
  const match = base.match(/^E(\d+(?:\.\d+)?)\s*-?\s*(.*)$/i)
  if (match) return { episode: Number(match[1]), title: match[2].trim() || base }
  return { episode: 0, title: base }
}

function parseSeasonFolder(name) {
  const match = name.match(/temporada\s*(\d+)/i) || name.match(/season\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

function slugId(relPath) {
  return relPath.replace(/[\\/]/g, "-").replace(/[^a-zA-Z0-9._-]/g, "_")
}

async function safeReaddir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

// Recursively collect every video file under `dir` as an individual movie entry.
async function collectMoviesRecursive(baseDir, dir) {
  const movies = []
  const entries = await safeReaddir(dir)
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      movies.push(...(await collectMoviesRecursive(baseDir, full)))
    } else if (entry.isFile() && isVideoFile(entry.name)) {
      const relPath = relative(baseDir, full)
      const { title, year } = parseTitleYear(stripExt(entry.name))
      movies.push({ id: slugId(relPath), relPath, title: title || stripExt(entry.name), year })
    }
  }
  return movies
}

// A "show" folder contains either episode files directly, or "Temporada N" subfolders.
async function collectShow(baseDir, showDir, showName) {
  const { title, year } = parseTitleYear(showName)
  const episodes = []
  const entries = await safeReaddir(showDir)
  for (const entry of entries) {
    const full = join(showDir, entry.name)
    if (entry.isFile() && isVideoFile(entry.name)) {
      const relPath = relative(baseDir, full)
      const { episode, title: episodeTitle } = parseEpisode(entry.name)
      episodes.push({ id: slugId(relPath), relPath, season: 1, episode, title: episodeTitle })
    } else if (entry.isDirectory()) {
      const season = parseSeasonFolder(entry.name) || 1
      const seasonEntries = await safeReaddir(full)
      for (const seasonEntry of seasonEntries) {
        if (seasonEntry.isFile() && isVideoFile(seasonEntry.name)) {
          const seasonFull = join(full, seasonEntry.name)
          const relPath = relative(baseDir, seasonFull)
          const { episode, title: episodeTitle } = parseEpisode(seasonEntry.name)
          episodes.push({ id: slugId(relPath), relPath, season, episode, title: episodeTitle })
        }
      }
    }
  }
  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode)
  return { id: slugId(relative(baseDir, showDir)), title: title || showName, year, episodes }
}

async function collectShowsUnder(baseDir, dir) {
  const shows = []
  const entries = await safeReaddir(dir)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      shows.push(await collectShow(baseDir, join(dir, entry.name), entry.name))
    }
  }
  return shows.filter((show) => show.episodes.length > 0)
}

async function buildLibrary(baseDir) {
  const movies = []
  const series = []
  const animeMovies = []
  const animeSeries = []

  const rootEntries = await safeReaddir(baseDir)
  for (const entry of rootEntries) {
    const full = join(baseDir, entry.name)
    if (entry.isFile() && isVideoFile(entry.name)) {
      const relPath = relative(baseDir, full)
      const { title, year } = parseTitleYear(stripExt(entry.name))
      movies.push({ id: slugId(relPath), relPath, title: title || stripExt(entry.name), year })
      continue
    }
    if (!entry.isDirectory()) continue

    const lowerName = entry.name.toLowerCase()
    if (lowerName === "series") {
      series.push(...(await collectShowsUnder(baseDir, full)))
    } else if (lowerName === "anime") {
      const animeEntries = await safeReaddir(full)
      for (const animeEntry of animeEntries) {
        const animeFull = join(full, animeEntry.name)
        const animeLower = animeEntry.name.toLowerCase()
        if (animeEntry.isFile() && isVideoFile(animeEntry.name)) {
          const relPath = relative(baseDir, animeFull)
          const { title, year } = parseTitleYear(stripExt(animeEntry.name))
          animeMovies.push({ id: slugId(relPath), relPath, title: title || stripExt(animeEntry.name), year })
        } else if (animeEntry.isDirectory() && /pel[ií]cula/i.test(animeLower)) {
          animeMovies.push(...(await collectMoviesRecursive(baseDir, animeFull)))
        } else if (animeEntry.isDirectory()) {
          animeSeries.push(...(await collectShowsUnder(baseDir, animeFull)))
        }
      }
    } else {
      // Genre folder (or franchise subfolder tree) — every video file inside is a movie.
      movies.push(...(await collectMoviesRecursive(baseDir, full)))
    }
  }

  return { movies, series, animeMovies, animeSeries }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.end(payload)
}

// Resolve an encoded relative path from a request URL and guard against path traversal.
function resolveLibraryPath(baseDir, encodedRelPath) {
  if (!baseDir) return null
  const relPath = decodeURIComponent(encodedRelPath)
  const absolute = normalize(resolve(baseDir, relPath))
  const baseWithSep = baseDir.endsWith(sep) ? baseDir : baseDir + sep
  if (absolute !== baseDir && !absolute.startsWith(baseWithSep)) return null
  return absolute
}

function streamVideo(req, res, filePath) {
  let stats
  try {
    stats = statSync(filePath)
  } catch {
    res.statusCode = 404
    res.end("Not found")
    return
  }
  const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream"
  const range = req.headers.range

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    const start = match && match[1] ? Number(match[1]) : 0
    const end = match && match[2] ? Number(match[2]) : stats.size - 1
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stats.size) {
      res.statusCode = 416
      res.setHeader("Content-Range", `bytes */${stats.size}`)
      res.end()
      return
    }
    res.statusCode = 206
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`)
    res.setHeader("Accept-Ranges", "bytes")
    res.setHeader("Content-Length", end - start + 1)
    res.setHeader("Content-Type", contentType)
    createReadStream(filePath, { start, end }).pipe(res)
    return
  }

  res.statusCode = 200
  res.setHeader("Accept-Ranges", "bytes")
  res.setHeader("Content-Length", stats.size)
  res.setHeader("Content-Type", contentType)
  createReadStream(filePath).pipe(res)
}

const TEXT_SUBTITLE_CODECS = new Set(["subrip", "ass", "ssa", "mov_text", "webvtt", "text"])

// Run ffprobe/ffmpeg and collect stdout as a Buffer; rejects on non-zero exit.
function runCapture(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    const chunks = []
    let stderr = ""
    child.stdout.on("data", (chunk) => chunks.push(chunk))
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", rejectPromise)
    child.on("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(chunks))
      else rejectPromise(new Error(`${command} exited with ${code}: ${stderr.slice(0, 500)}`))
    })
  })
}

// List embedded audio/subtitle streams, each with both its absolute ffprobe index
// (for display) and its 0-based per-type index (what ffmpeg's `-map 0:a:N` expects).
async function probeTracks(filePath) {
  const output = await runCapture("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=index,codec_type,codec_name:stream_tags=language,title,filename,mimetype",
    "-show_entries", "format=duration",
    "-show_chapters",
    "-of", "json",
    filePath,
  ])
  const data = JSON.parse(output.toString("utf8"))
  const streams = Array.isArray(data.streams) ? data.streams : []
  // Chapter markers, when present, are the most reliable way to know where credits
  // actually start — far better than guessing from a fixed "last N seconds" offset,
  // since credits length varies a lot between shows. Exposed as-is; the client
  // decides how to interpret them (named "Credits" chapter, or a short final one).
  const chapters = (Array.isArray(data.chapters) ? data.chapters : []).map((chapter) => ({
    title: chapter.tags?.title || "",
    start: Number(chapter.start_time) || 0,
    end: Number(chapter.end_time) || 0,
  }))
  const audioTracks = []
  const subtitleTracks = []
  const fonts = []
  let audioTypeIndex = 0
  let subtitleTypeIndex = 0
  let attachmentTypeIndex = 0
  for (const stream of streams) {
    const tags = stream.tags || {}
    if (stream.codec_type === "audio") {
      audioTracks.push({ index: audioTypeIndex, codec: stream.codec_name, language: tags.language || "", title: tags.title || "" })
      audioTypeIndex++
    } else if (stream.codec_type === "subtitle") {
      // Image-based subtitle codecs (PGS, DVD/VOB) can't be converted to text by
      // ffmpeg — keep the type-relative index in sync for `-map 0:s:N` but hide
      // them from the client so picking one never 500s.
      if (TEXT_SUBTITLE_CODECS.has(stream.codec_name)) {
        const disp = stream.disposition || {}
        subtitleTracks.push({
          index: subtitleTypeIndex,
          codec: stream.codec_name,
          format: STYLED_SUBTITLE_CODECS.has(stream.codec_name) ? "ass" : "vtt",
          language: tags.language || "",
          title: tags.title || "",
          // So the client can tell two same-language tracks apart (e.g. a full
          // dialogue track vs a forced signs-only one that otherwise both show
          // as just "spa").
          forced: Boolean(disp.forced),
          hearingImpaired: Boolean(disp.hearing_impaired),
          default: Boolean(disp.default),
        })
      }
      subtitleTypeIndex++
    } else if (stream.codec_type === "attachment") {
      const filename = tags.filename || ""
      if (/\.(ttf|otf|woff2?|ttc)$/i.test(filename)) {
        fonts.push({ index: attachmentTypeIndex, filename, mimetype: tags.mimetype || "" })
      }
      attachmentTypeIndex++
    }
  }
  const duration = Number(data.format?.duration) || 0
  return { audioTracks, subtitleTracks, fonts, chapters, duration, thumbnailInterval: thumbnailInterval(duration) }
}

// Audio-only stream for one track, always transcoded to AAC/ADTS so it's guaranteed
// browser-playable regardless of the source codec (AC-3/DTS are common in these
// files). This is intentionally separate from the video: the <video> element stays
// on the raw, byte-range-seekable file the whole time as the sync "master clock",
// and only this small <audio> element gets reloaded when the user switches language
// — see MediaSyncManager (src/lib/media-sync.ts) for how the two stay locked together.
function streamAudioOnly(res, filePath, audioIndex, startSeconds) {
  const args = [
    "-hide_banner", "-loglevel", "error",
    // Survive malformed/unusual streams (odd timestamps, truncated frames) instead
    // of aborting the whole transcode over a single bad packet.
    "-err_detect", "ignore_err",
    "-fflags", "+genpts+igndts",
    ...(startSeconds > 0 ? ["-ss", startSeconds.toFixed(3)] : []),
    "-i", filePath,
    "-map", `0:a:${audioIndex}`,
    "-vn", "-sn",
    // Force a sample rate AAC always accepts — some sources (48kHz DTS-HD cores,
    // 44.1kHz commentary tracks, odd downsampled dubs) would otherwise occasionally
    // produce an encoder we silently couldn't play back.
    "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k",
    "-avoid_negative_ts", "make_zero",
    "-f", "adts",
    "pipe:1",
  ]
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] })
  let headersSent = false
  let stderr = ""
  const sendHeaders = () => {
    if (headersSent || res.headersSent) return
    headersSent = true
    res.statusCode = 200
    res.setHeader("Content-Type", "audio/aac")
  }
  child.stdout.on("data", (chunk) => {
    sendHeaders()
    res.write(chunk)
  })
  child.stdout.on("end", () => {
    sendHeaders() // ffmpeg produced zero bytes but exited 0 — still close the response cleanly
    res.end()
  })
  child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
  child.on("error", () => {
    if (!res.headersSent) { res.statusCode = 500 }
    res.end()
  })
  child.on("close", (code) => {
    // ffmpeg died before producing any audio at all (bad track index, undecodable
    // codec, corrupt file) — surface a real error instead of a silent empty 200 so
    // the player can detect it and retry/fall back instead of just staying muted.
    if (code !== 0 && !headersSent) {
      res.statusCode = 500
      res.setHeader("Content-Type", "text/plain")
      res.end(stderr.slice(0, 500) || `ffmpeg exited with ${code}`)
    }
  })
  res.on("close", () => child.kill("SIGKILL"))
}

async function readCached(cachePath) {
  try {
    return await readFile(cachePath)
  } catch {
    return null
  }
}

// If a background prewarm pass for this file is running, wait for it (it's
// almost certainly already producing this exact track) instead of racing it
// with a second ffmpeg.
async function awaitPrewarm(filePath) {
  const job = subtitlePrewarmJobs.get(filePath)
  if (job) await job.catch(() => {})
}

async function serveSubtitle(res, filePath, subtitleIndex) {
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => {})
  const cacheKey = createHash("sha1").update(`${filePath}::${subtitleIndex}`).digest("hex")
  const cachePath = join(CACHE_DIR, `${cacheKey}.vtt`)
  let cached = await readCached(cachePath)
  if (!cached) {
    await awaitPrewarm(filePath)
    cached = await readCached(cachePath)
  }
  if (cached) {
    res.statusCode = 200
    res.setHeader("Content-Type", "text/vtt; charset=utf-8")
    res.end(cached)
    return
  }
  try {
    const vtt = await runCapture("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", filePath,
      "-map", `0:s:${subtitleIndex}`,
      "-f", "webvtt",
      "pipe:1",
    ])
    await writeFile(cachePath, vtt).catch(() => {})
    res.statusCode = 200
    res.setHeader("Content-Type", "text/vtt; charset=utf-8")
    res.end(vtt)
  } catch (err) {
    res.statusCode = 500
    res.end(String(err))
  }
}

// Raw ASS/SSA extraction (stream copy, no conversion) so the full [V4+ Styles] block
// and override tags survive intact for the JASSUB/libass renderer on the client.
async function serveSubtitleRaw(res, filePath, subtitleIndex) {
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => {})
  const cacheKey = createHash("sha1").update(`${filePath}::${subtitleIndex}::raw`).digest("hex")
  const cachePath = join(CACHE_DIR, `${cacheKey}.ass`)
  let cached = await readCached(cachePath)
  if (!cached) {
    await awaitPrewarm(filePath)
    cached = await readCached(cachePath)
  }
  if (cached) {
    res.statusCode = 200
    res.setHeader("Content-Type", "text/x-ssa; charset=utf-8")
    res.end(cached)
    return
  }
  try {
    const ass = await runCapture("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", filePath,
      "-map", `0:s:${subtitleIndex}`,
      "-c:s", "copy",
      "-f", "ass",
      "pipe:1",
    ])
    await writeFile(cachePath, ass).catch(() => {})
    res.statusCode = 200
    res.setHeader("Content-Type", "text/x-ssa; charset=utf-8")
    res.end(ass)
  } catch (err) {
    res.statusCode = 500
    res.end(String(err))
  }
}

function subtitleCachePath(filePath, index, raw) {
  const key = createHash("sha1")
    .update(`${filePath}::${index}${raw ? "::raw" : ""}`)
    .digest("hex")
  return join(CACHE_DIR, `${key}.${raw ? "ass" : "vtt"}`)
}

const subtitlePrewarmJobs = new Map()

// Extracting an embedded subtitle track from a multi-GB MKV means demuxing the
// whole file (subtitle packets are interleaved throughout), which can take tens
// of seconds — long enough that the track looks like it "just doesn't show".
// So when an episode's track list is first fetched, warm every text track's
// cache in the background in a single demux pass, so by the time the viewer
// picks one it's already on disk. mp4/mov_text extraction is fast, so this
// mostly matters for MKVs, but it's harmless either way.
async function prewarmSubtitles(filePath, subtitleTracks) {
  const tracks = (subtitleTracks || []).filter((track) => track && Number.isInteger(track.index))
  if (tracks.length === 0) return
  if (subtitlePrewarmJobs.has(filePath)) return subtitlePrewarmJobs.get(filePath)

  const job = (async () => {
    await mkdir(CACHE_DIR, { recursive: true }).catch(() => {})
    const pending = tracks
      .map((track) => {
        const raw = track.format === "ass"
        return { index: track.index, raw, cachePath: subtitleCachePath(filePath, track.index, raw) }
      })
      .filter((entry) => !existsSync(entry.cachePath))
    if (pending.length === 0) return

    const extract = async (entries) => {
      const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", filePath]
      for (const entry of entries) {
        args.push("-map", `0:s:${entry.index}`)
        if (entry.raw) args.push("-c:s", "copy", "-f", "ass")
        else args.push("-f", "webvtt")
        args.push(`${entry.cachePath}.tmp`)
      }
      await runCapture("ffmpeg", args)
      for (const entry of entries) {
        await rename(`${entry.cachePath}.tmp`, entry.cachePath).catch(() => {})
      }
    }

    // One combined pass first; if it fails (a single bad stream aborts the whole
    // multi-output run) retry each still-missing track on its own.
    try {
      await extract(pending)
    } catch {
      // fall through to per-track
    }
    for (const entry of pending) {
      if (existsSync(entry.cachePath)) continue
      try {
        await extract([entry])
      } catch {
        await rm(`${entry.cachePath}.tmp`, { force: true }).catch(() => {})
      }
    }
  })()

  subtitlePrewarmJobs.set(filePath, job)
  job.finally(() => subtitlePrewarmJobs.delete(filePath)).catch(() => {})
  return job
}

// Fonts embedded as MKV attachments — dumped instantly since ffmpeg reads attachment
// data from the header, not by scanning the file (the tiny -t window just gives it a
// valid output to finish against).
async function serveFont(res, filePath, attachmentIndex, filename) {
  await mkdir(FONT_CACHE_DIR, { recursive: true }).catch(() => {})
  const ext = (extname(filename) || ".ttf").toLowerCase()
  const cacheKey = createHash("sha1").update(`${filePath}::${attachmentIndex}`).digest("hex")
  const cachePath = join(FONT_CACHE_DIR, `${cacheKey}${ext}`)
  const cached = await readCached(cachePath)
  const contentType = FONT_MIME_TYPES[ext] || "application/octet-stream"
  if (cached) {
    res.statusCode = 200
    res.setHeader("Content-Type", contentType)
    res.end(cached)
    return
  }
  try {
    const font = await runCapture("ffmpeg", [
      "-y", "-dump_attachment:t:" + attachmentIndex, "pipe:1",
      "-i", filePath,
      "-t", "0.01",
      "-f", "null",
      "-",
    ])
    await writeFile(cachePath, font).catch(() => {})
    res.statusCode = 200
    res.setHeader("Content-Type", contentType)
    res.end(font)
  } catch (err) {
    res.statusCode = 500
    res.end(String(err))
  }
}

// Scrub-bar hover preview — a single small JPEG frame near the requested second.
// `-ss` before `-i` does a fast, keyframe-level (not frame-accurate) seek, which
// is exactly the tradeoff scrubbing wants: near-instant response over exactness.
// Cached to disk per (file, whole second) so repeatedly hovering the same spot
// never re-invokes ffmpeg.
async function serveThumbnail(res, filePath, seconds) {
  await mkdir(THUMB_CACHE_DIR, { recursive: true }).catch(() => {})
  const cacheKey = createHash("sha1").update(`${filePath}::${seconds}`).digest("hex")
  const cachePath = join(THUMB_CACHE_DIR, `${cacheKey}.jpg`)
  const cached = await readCached(cachePath)
  if (cached) {
    res.statusCode = 200
    res.setHeader("Content-Type", "image/jpeg")
    res.setHeader("Cache-Control", "public, max-age=86400")
    res.end(cached)
    return
  }
  try {
    const jpeg = await runCapture("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", String(seconds),
      "-i", filePath,
      "-frames:v", "1",
      "-q:v", "4",
      "-vf", `scale=${THUMBNAIL_WIDTH}:-2`,
      "-f", "mjpeg",
      "pipe:1",
    ])
    if (jpeg.length === 0) throw new Error("empty frame")
    await writeFile(cachePath, jpeg).catch(() => {})
    res.statusCode = 200
    res.setHeader("Content-Type", "image/jpeg")
    res.setHeader("Cache-Control", "public, max-age=86400")
    res.end(jpeg)
  } catch (err) {
    res.statusCode = 500
    res.end(String(err))
  }
}

// Tracks pregeneration passes currently running, keyed by file path, so a
// second trigger for the same file (episode remount, dev double-mount) joins
// the existing job instead of spawning a duplicate ffmpeg pass.
const thumbnailPregenJobs = new Map()

// Turn a ffmpeg frame filename ("000007.jpg") into the "second" it represents
// and the final cache path serveThumbnail will look for.
function thumbnailCachePathFor(filePath, frameName, interval) {
  const index = Number(frameName.slice(0, frameName.indexOf("."))) - 1
  if (!Number.isFinite(index) || index < 0) return null
  const second = index * interval
  const cacheKey = createHash("sha1").update(`${filePath}::${second}`).digest("hex")
  return join(THUMB_CACHE_DIR, `${cacheKey}.jpg`)
}

// Warms the on-demand thumbnail cache for an entire file in ONE ffmpeg pass —
// far cheaper than the live per-hover extraction in serveThumbnail, since the
// file is decoded once instead of re-seeking per frame. Runs ffmpeg unbuffered
// (spawn, not runCapture) and polls its output directory while it's still
// running, promoting each finished frame into THUMB_CACHE_DIR as soon as it
// lands — so scrub hovers near the start of the file go instant within a
// couple seconds, without waiting for ffmpeg to reach the end of a long movie.
async function pregenerateThumbnails(filePath, duration) {
  const interval = thumbnailInterval(duration)
  const markerPath = join(
    THUMB_CACHE_DIR,
    createHash("sha1").update(`${filePath}::manifest::${interval}`).digest("hex") + ".done"
  )
  if (existsSync(markerPath)) return
  if (thumbnailPregenJobs.has(filePath)) return thumbnailPregenJobs.get(filePath)

  const job = new Promise((resolveJob) => {
    (async () => {
      await mkdir(THUMB_CACHE_DIR, { recursive: true }).catch(() => {})
      const tmpDir = join(THUMB_CACHE_DIR, `.tmp-${createHash("sha1").update(filePath).digest("hex")}`)
      await mkdir(tmpDir, { recursive: true }).catch(() => {})

      const promoted = new Set()
      // Skips the most-recently-numbered file each pass: it may still be mid-write
      // by ffmpeg, and promoting a partial JPEG would cache a broken image.
      const promoteFinishedFrames = async () => {
        let names
        try {
          names = await readdir(tmpDir)
        } catch {
          return
        }
        const frames = names.filter((name) => name.endsWith(".jpg")).sort()
        for (const name of frames.slice(0, -1)) {
          if (promoted.has(name)) continue
          const dest = thumbnailCachePathFor(filePath, name, interval)
          if (!dest) continue
          try {
            await rename(join(tmpDir, name), dest)
            promoted.add(name)
          } catch {
            // Still being written — retried next poll.
          }
        }
      }

      const child = spawn("ffmpeg", [
        "-hide_banner", "-loglevel", "error",
        "-i", filePath,
        "-vf", `fps=1/${interval},scale=${THUMBNAIL_WIDTH}:-2`,
        "-q:v", "5",
        join(tmpDir, "%06d.jpg"),
      ], { stdio: ["ignore", "ignore", "ignore"] })

      const pollTimer = setInterval(promoteFinishedFrames, 500)

      const finish = async () => {
        clearInterval(pollTimer)
        await promoteFinishedFrames() // every file is complete now — promote the last one too
        await writeFile(markerPath, String(promoted.size)).catch(() => {})
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
        thumbnailPregenJobs.delete(filePath)
        resolveJob()
      }
      child.on("close", finish)
      child.on("error", finish)
    })()
  })

  thumbnailPregenJobs.set(filePath, job)
  return job
}

function isDir(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// Look for `<subdir>/LIBRARY_FOLDER_NAME` one level under `parentDir` (e.g. mount
// points), optionally recursing one more level for layouts like
// `/media/<user>/<disk>/Peliculas`.
function findLibraryUnder(parentDir, depth = 1) {
  if (!isDir(parentDir)) return null
  let entries
  try {
    entries = readdirSync(parentDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    return null
  }
  for (const entry of entries) {
    const subdir = join(parentDir, entry.name)
    const candidate = join(subdir, LIBRARY_FOLDER_NAME)
    if (isDir(candidate)) return candidate
    if (depth > 1) {
      const nested = findLibraryUnder(subdir, depth - 1)
      if (nested) return nested
    }
  }
  return null
}

// No LOCAL_MOVIES_DIR set — look for a "Peliculas" folder in the usual places for
// the current OS: any drive letter on Windows, mounted volumes on Linux/macOS, and
// common home-folder locations. Returns null if nothing is found.
function findDefaultLibraryDir() {
  const home = homedir()

  if (process.platform === "win32") {
    for (let code = 67 /* C */; code <= 90 /* Z */; code++) {
      const candidate = `${String.fromCharCode(code)}:\\${LIBRARY_FOLDER_NAME}`
      if (isDir(candidate)) return candidate
    }
    return null
  }

  if (process.platform === "darwin") {
    const onVolume = findLibraryUnder("/Volumes")
    if (onVolume) return onVolume
    const inMovies = join(home, "Movies", LIBRARY_FOLDER_NAME)
    if (isDir(inMovies)) return inMovies
    return null
  }

  // Linux
  const onRunMedia = findLibraryUnder("/run/media", 2) // /run/media/<user>/<disk>/Peliculas
  if (onRunMedia) return onRunMedia
  const onMedia = findLibraryUnder("/media", 2) // /media/<disk>/Peliculas or /media/<user>/<disk>/Peliculas
  if (onMedia) return onMedia
  const onMnt = findLibraryUnder("/mnt") // /mnt/<disk>/Peliculas
  if (onMnt) return onMnt
  for (const candidate of [join(home, LIBRARY_FOLDER_NAME), join(home, "Videos", LIBRARY_FOLDER_NAME)]) {
    if (isDir(candidate)) return candidate
  }
  return null
}

export function localMediaDevPlugin() {
  const configuredDir = process.env.LOCAL_MOVIES_DIR || findDefaultLibraryDir()
  const baseDir = configuredDir ? normalize(configuredDir) : null

  return {
    name: "flick-local-media-dev",
    apply: /** @type {"serve"} */ ("serve"), // dev server only — never included in `astro build`
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(LIBRARY_API_PATH)) return next()
        if (!baseDir || !existsSync(baseDir)) {
          const error = baseDir
            ? `Directory not found: ${baseDir}`
            : `No movie library found automatically. Set LOCAL_MOVIES_DIR in your .env file to the path of your "${LIBRARY_FOLDER_NAME}" folder.`
          sendJson(res, 200, { movies: [], series: [], animeMovies: [], animeSeries: [], error })
          return
        }
        try {
          const library = await buildLibrary(baseDir)
          sendJson(res, 200, library)
        } catch (err) {
          sendJson(res, 500, { movies: [], series: [], animeMovies: [], animeSeries: [], error: String(err) })
        }
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(VIDEO_INFO_API_PATH)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.searchParams.get("path") || ""
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        if (!filePath) {
          sendJson(res, 400, { error: "Invalid path" })
          return
        }
        try {
          const info = await probeTracks(filePath)
          sendJson(res, 200, info)
          // Fire-and-forget: warm the subtitle cache so picking a track later is
          // instant instead of waiting on a full MKV demux.
          prewarmSubtitles(filePath, info.subtitleTracks).catch(() => {})
        } catch (err) {
          sendJson(res, 500, { audioTracks: [], subtitleTracks: [], chapters: [], duration: 0, error: String(err) })
        }
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(SUBTITLE_RAW_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(SUBTITLE_RAW_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        const streamParam = url.searchParams.get("stream")
        if (!filePath || streamParam === null || Number.isNaN(Number(streamParam))) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        await serveSubtitleRaw(res, filePath, Number(streamParam))
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(SUBTITLE_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(SUBTITLE_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        const streamParam = url.searchParams.get("stream")
        if (!filePath || streamParam === null || Number.isNaN(Number(streamParam))) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        await serveSubtitle(res, filePath, Number(streamParam))
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(FONT_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(FONT_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        const attachmentParam = url.searchParams.get("attachment")
        const filename = url.searchParams.get("filename") || ""
        if (!filePath || attachmentParam === null || Number.isNaN(Number(attachmentParam))) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        await serveFont(res, filePath, Number(attachmentParam), filename)
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(THUMBNAIL_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(THUMBNAIL_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        const rawSeconds = Number(url.searchParams.get("t"))
        if (!filePath || Number.isNaN(rawSeconds) || rawSeconds < 0) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        await serveThumbnail(res, filePath, Math.round(rawSeconds))
      })

      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(THUMBNAIL_PREGEN_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(THUMBNAIL_PREGEN_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        const duration = Number(url.searchParams.get("duration"))
        if (!filePath || Number.isNaN(duration) || duration <= 0) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        // Fire-and-forget: the client doesn't wait for the whole file to be
        // warmed, just needs the pass kicked off as early as possible (ideally
        // while the episode is still loading, well ahead of any scrubbing).
        pregenerateThumbnails(filePath, duration).catch(() => {})
        res.statusCode = 202
        res.end()
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(AUDIO_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(AUDIO_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        const trackParam = url.searchParams.get("track")
        if (!filePath || trackParam === null || Number.isNaN(Number(trackParam))) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        const startSeconds = Number(url.searchParams.get("start")) || 0
        streamAudioOnly(res, filePath, Number(trackParam), startSeconds)
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(VIDEO_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(VIDEO_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        if (!filePath) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        streamVideo(req, res, filePath)
      })
    },
  }
}
