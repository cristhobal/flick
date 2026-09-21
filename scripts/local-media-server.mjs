// Dev-only Vite middleware that exposes the local movie library on disk so `npm run dev`
// can browse and stream real files instead of TMDB trailers. Registered with `apply: "serve"`
// so it never runs (and never ships) during `astro build` / production.
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join, normalize, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { homedir } from "node:os"

// Includes the MPEG-TS family (.m2ts/.mts/.ts — Blu-ray remuxes and camcorder
// rips) and MPEG program streams. Browsers can't demux those natively, so they
// are played through the on-the-fly remux pipeline (see streamRemux below).
const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v",
  ".m2ts", ".mts", ".ts", ".mpg", ".mpeg", ".ogv", ".3gp",
])
// Containers Chrome/Firefox can't open in a <video> element at all. Everything
// else is tried natively first (see needsRemux for the codec-level fallback).
const NON_NATIVE_CONTAINERS = new Set([".m2ts", ".mts", ".ts", ".mpg", ".mpeg", ".avi", ".wmv", ".flv"])
const MIME_TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".m2ts": "video/mp2t",
  ".mts": "video/mp2t",
  ".ts": "video/mp2t",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".ogv": "video/ogg",
  ".3gp": "video/3gpp",
}

const LIBRARY_FOLDER_NAME = "Peliculas"
const LIBRARY_API_PATH = "/api/local-library"
const VIDEO_API_PREFIX = "/api/local-video/"
const AUDIO_API_PREFIX = "/api/local-audio/"
const REMUX_API_PREFIX = "/api/local-remux/"
const PREFS_API_PATH = "/api/local-prefs"
const VIDEO_INFO_API_PATH = "/api/local-video-info"
const SUBTITLE_API_PREFIX = "/api/local-subtitle/"
const SUBTITLE_RAW_API_PREFIX = "/api/local-subtitle-raw/"
const SUBTITLE_PGS_API_PREFIX = "/api/local-subtitle-pgs/"
const FONT_API_PREFIX = "/api/local-font/"
const SUBTITLE_FONT_API_PATH = "/api/subtitle-font"
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
// Viewer choices (audio/subtitle per title) live outside .media-cache on purpose:
// that folder is disposable cache, this is user data that must survive clearing it.
const PREFS_FILE = resolve(process.cwd(), ".flick-data", "media-prefs.json")

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

// A ripped Blu-ray keeps its film in `<Movie (2016)>/BDMV/STREAM/00000.m2ts`,
// next to menu clips and extras. Treat the whole disc folder as ONE movie —
// named after the folder that holds BDMV, playing its biggest stream (the
// feature) — instead of listing every numbered clip as a title of its own.
async function findBlurayFeature(bdmvDir) {
  const streams = await safeReaddir(join(bdmvDir, "STREAM"))
  let best = null
  for (const stream of streams) {
    if (!stream.isFile() || !isVideoFile(stream.name)) continue
    const full = join(bdmvDir, "STREAM", stream.name)
    let size = 0
    try {
      size = statSync(full).size
    } catch {
      continue
    }
    if (!best || size > best.size) best = { full, size }
  }
  return best ? best.full : null
}

// Recursively collect every video file under `dir` as an individual movie entry.
async function collectMoviesRecursive(baseDir, dir) {
  const movies = []
  const entries = await safeReaddir(dir)
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && entry.name.toUpperCase() === "BDMV") {
      const feature = await findBlurayFeature(full)
      if (feature) {
        const relPath = relative(baseDir, feature)
        const { title, year } = parseTitleYear(basename(dir))
        movies.push({ id: slugId(relPath), relPath, title: title || basename(dir), year })
      }
    } else if (entry.isDirectory()) {
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

// Every ffmpeg/ffprobe we start is tracked so none outlives the dev server — a
// remux of a 27 GB file left running after Ctrl+C would keep hammering the disk.
const liveChildren = new Set()
function trackChild(child) {
  liveChildren.add(child)
  child.on("close", () => liveChildren.delete(child))
  return child
}
function killLiveChildren() {
  for (const child of liveChildren) child.kill("SIGKILL")
}
process.on("exit", killLiveChildren)
// Ctrl+C / `kill` end the process without running "exit" handlers unless the signal
// is caught. Kill the children, then re-raise so the normal shutdown still happens.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    killLiveChildren()
    process.kill(process.pid, signal)
  })
}

// Background work (subtitle extraction, thumbnail passes) must never starve the
// stream the viewer is actually watching, so it runs at reduced CPU priority.
function spawnLowPriority(command, args, options) {
  if (process.platform === "win32") return trackChild(spawn(command, args, options))
  return trackChild(spawn("nice", ["-n", "12", command, ...args], options))
}

// Run ffprobe/ffmpeg and collect stdout as a Buffer; rejects on non-zero exit.
function runCapture(command, args, { lowPriority = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const spawnFn = lowPriority ? spawnLowPriority : (cmd, cmdArgs, opts) => trackChild(spawn(cmd, cmdArgs, opts))
    const child = spawnFn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
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

// ffprobe results per file, keyed by path and invalidated when the file's size or
// mtime changes. Playback fires several requests (video-info, then a remux stream
// per seek) that all need the same facts; on a multi-GB file on an external drive
// re-probing each time is wasted latency.
const probeCache = new Map()

function probeRaw(filePath) {
  let signature = ""
  try {
    const stats = statSync(filePath)
    signature = `${stats.size}:${stats.mtimeMs}`
  } catch {
    // Fall through — ffprobe reports the real error below.
  }
  const cached = probeCache.get(filePath)
  if (cached && cached.signature === signature) return cached.promise
  const promise = runCapture("ffprobe", [
    "-v", "error",
    "-show_entries",
    "stream=index,codec_type,codec_name,profile,level,channels,pix_fmt,field_order,color_transfer,width,height,avg_frame_rate:stream_tags=language,title,filename,mimetype:stream_disposition=default,forced,hearing_impaired,attached_pic",
    "-show_entries", "format=duration,start_time",
    "-show_chapters",
    "-of", "json",
    filePath,
  ]).then((output) => JSON.parse(output.toString("utf8")))
  probeCache.set(filePath, { signature, promise })
  promise.catch(() => probeCache.delete(filePath))
  return promise
}

// H.264 8-bit 4:2:0 up to level 5.2 decodes in every browser's MSE pipeline, so it
// can be stream-copied. Anything else (MPEG-2/VC-1 from older Blu-rays, HEVC, 10-bit,
// 4:2:2, interlaced) is re-encoded to a browser-safe H.264 on the fly.
const COPYABLE_H264_PROFILES = new Set(["Baseline", "Constrained Baseline", "Main", "Extended", "High"])
function pickVideoMode(video) {
  if (!video) return "copy"
  const progressive = !video.fieldOrder || video.fieldOrder === "progressive" || video.fieldOrder === "unknown"
  const copyable =
    video.codec === "h264" &&
    video.pixFmt === "yuv420p" &&
    COPYABLE_H264_PROFILES.has(video.profile) &&
    (video.level || 0) <= 52 &&
    progressive
  return copyable ? "copy" : "transcode"
}

// Facts the remux pipeline and the client need about one file's video stream.
async function getStreamPlan(filePath) {
  const data = await probeRaw(filePath)
  const streams = Array.isArray(data.streams) ? data.streams : []
  const rawVideo = streams.find((stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1)
  const video = rawVideo
    ? {
        codec: rawVideo.codec_name,
        profile: rawVideo.profile || "",
        level: Number(rawVideo.level) || 0,
        pixFmt: rawVideo.pix_fmt || "",
        fieldOrder: rawVideo.field_order || "",
        colorTransfer: rawVideo.color_transfer || "",
        width: Number(rawVideo.width) || 0,
        height: Number(rawVideo.height) || 0,
      }
    : null
  return {
    startTime: Number(data.format?.start_time) || 0,
    duration: Number(data.format?.duration) || 0,
    audioCount: streams.filter((stream) => stream.codec_type === "audio").length,
    video,
    videoMode: pickVideoMode(video),
  }
}

// Whether <video src=file> is hopeless and the stream must be remuxed instead: a
// container browsers can't open (MPEG-TS, AVI, …). Deliberately NOT decided by codec:
// whether a browser can decode e.g. HEVC depends on the machine (hardware decoders),
// which only the browser knows — so a native <video> that errors falls back to remux
// on the client (LocalVideoPlayer's onError), and one that works is left alone.
function needsRemux(filePath) {
  return NON_NATIVE_CONTAINERS.has(extname(filePath).toLowerCase())
}

const AUDIO_CODEC_LABELS = { dts: "DTS", truehd: "TrueHD", eac3: "E-AC-3", ac3: "AC-3", aac: "AAC", flac: "FLAC", opus: "Opus", mp3: "MP3", pcm_bluray: "LPCM", pcm_s16le: "PCM", pcm_s24le: "PCM" }
function channelLabel(channels) {
  if (channels === 6) return "5.1"
  if (channels === 8) return "7.1"
  if (channels === 2) return "2.0"
  if (channels === 1) return "1.0"
  return channels ? `${channels}ch` : ""
}

// List embedded audio/subtitle streams, each with both its absolute ffprobe index
// (for display) and its 0-based per-type index (what ffmpeg's `-map 0:a:N` expects).
async function probeTracks(filePath) {
  const data = await probeRaw(filePath)
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
      const codecLabel = AUDIO_CODEC_LABELS[stream.codec_name] || stream.codec_name || ""
      const profile = stream.profile && /dts-hd|atmos|x/i.test(stream.profile) ? stream.profile : ""
      audioTracks.push({
        index: audioTypeIndex,
        codec: stream.codec_name,
        language: tags.language || "",
        title: tags.title || "",
        channels: Number(stream.channels) || 0,
        // Untagged tracks (common in Blu-ray rips: the TS carries no language) still
        // need something recognisable in the menu — "DTS-HD MA 5.1", not just "Audio 2".
        detail: [profile || codecLabel, channelLabel(Number(stream.channels) || 0)].filter(Boolean).join(" "),
      })
      audioTypeIndex++
    } else if (stream.codec_type === "subtitle") {
      const disp = stream.disposition || {}
      // Image-based subtitle codecs can't become text. PGS (Blu-ray) is drawn by the
      // client's own bitmap renderer; DVD/VOB subtitles stay hidden — but the
      // type-relative index is still counted so `-map 0:s:N` stays in sync.
      const isText = TEXT_SUBTITLE_CODECS.has(stream.codec_name)
      const isPgs = stream.codec_name === "hdmv_pgs_subtitle"
      if (isText || isPgs) {
        subtitleTracks.push({
          index: subtitleTypeIndex,
          codec: stream.codec_name,
          format: isPgs ? "pgs" : STYLED_SUBTITLE_CODECS.has(stream.codec_name) ? "ass" : "vtt",
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
  const plan = await getStreamPlan(filePath)
  return {
    audioTracks,
    subtitleTracks,
    fonts,
    chapters,
    duration: plan.duration,
    // Container clock origin: MPEG-TS files start at e.g. 0.54s, not 0. The remux
    // stream keeps those raw timestamps, so the player maps them back with this.
    startTime: plan.startTime,
    remux: needsRemux(filePath),
    thumbnailInterval: thumbnailInterval(plan.duration),
  }
}

// Audio-only stream for one track, always transcoded to AAC/ADTS so it's guaranteed
// browser-playable regardless of the source codec (AC-3/DTS are common in these
// files). This is intentionally separate from the video: the <video> element stays
// on the raw, byte-range-seekable file the whole time as the sync "master clock",
// and only this small <audio> element gets reloaded when the user switches language
// — see MediaSyncManager (src/lib/media-sync.ts) for how the two stay locked together.
function streamAudioOnly(res, filePath, audioIndex, startSeconds) {
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin",
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
  pipeFfmpeg(res, args, "audio/aac")
}

// Run ffmpeg and pipe its stdout into the HTTP response with real backpressure:
// when the browser stops reading (its media buffer is full) the pipe fills, ffmpeg
// blocks on its own write, and it stops decoding/reading the source. The previous
// per-chunk `res.write` ignored that signal, so a fast transcode of a long file was
// buffered whole in Node's memory whenever the browser lagged behind it.
//
// Headers are held back until the first byte so a failure that happens before any
// output (bad track index, undecodable codec, corrupt file) becomes a real 500 the
// client can react to, instead of an empty 200 that leaves playback silently stuck.
function pipeFfmpeg(res, args, contentType, { lowPriority = false } = {}) {
  // The client may already be gone (e.g. it aborted while the caller was probing the
  // file). Its "close" event has fired by now, so nothing would ever kill the child.
  if (res.destroyed || res.closed) return
  const spawnFn = lowPriority ? spawnLowPriority : (cmd, cmdArgs, opts) => trackChild(spawn(cmd, cmdArgs, opts))
  const child = spawnFn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] })
  let stderr = ""
  let started = false
  let closed = false

  child.stderr.on("data", (chunk) => {
    if (stderr.length < 4000) stderr += chunk.toString()
  })
  child.stdout.once("data", () => {
    started = true
    res.statusCode = 200
    res.setHeader("Content-Type", contentType)
    res.setHeader("Cache-Control", "no-store")
  })
  // `end: false` — the response is closed by hand below, once the exit status is
  // known, so a crash mid-stream can be told apart from a normal end of file.
  child.stdout.pipe(res, { end: false })
  child.on("error", () => {
    if (!res.headersSent) res.statusCode = 500
    res.end()
  })
  child.on("close", (code) => {
    if (closed) return
    if (started) {
      // Clean exit: finish the response. Failure partway through: drop the
      // connection so the client sees a network error (and retries) instead of
      // mistaking a truncated stream for the whole file.
      if (code === 0) res.end()
      else res.destroy()
      return
    }
    // ffmpeg died before producing any output at all — surface a real error.
    if (!res.headersSent && !res.writableEnded) {
      res.statusCode = code === 0 ? 200 : 500
      res.setHeader("Content-Type", code === 0 ? contentType : "text/plain")
      res.end(code === 0 ? undefined : stderr.slice(0, 500) || `ffmpeg exited with ${code}`)
    }
  })
  res.on("close", () => {
    closed = true
    child.kill("SIGKILL")
  })
}

// Live remux for files the browser can't play directly (MPEG-TS/.m2ts, AVI, …, or
// unsupported video codecs): one ffmpeg process turns the source into a fragmented
// MP4 — video + the chosen audio track (always AAC) — starting at `startSeconds`, and
// the client feeds it to a MediaSource (src/lib/remux-stream.ts). Because video and
// audio come out of the same process on the same timeline, they cannot drift apart.
//
// Video is stream-copied whenever the codec is browser-safe (a Blu-ray's H.264 costs
// no CPU and starts instantly); otherwise it is re-encoded to H.264.
//
// Timestamps are the source's own (`-copyts`), made absolute in the fMP4 by
// `frag_discont`, so the client can map them back to movie time with just the
// container's start offset. Two details keep that exact:
//   - Timing note: `-use_editlist 0` + `negative_cts_offsets` is what keeps picture and
//     sound aligned. Measured in Chrome with a test file whose picture flashes and
//     sound beeps on the same whole seconds: A/V offset ~3ms (the same as a native mp4)
//     for sources with 0, 1, 2 and 3 B-frames. Trying to pre-compensate the muxer's
//     composition shift by hand (ffmpeg's `setts`) made it WORSE, by 40-80ms, and
//     `ffprobe` on the output is misleading here (it applies the MP4 edit list, which
//     browsers treat differently) — verify changes to these flags in a browser.
//   - Copying can only cut on a keyframe, and ffmpeg lands on the first one AFTER the
//     requested time. Starting a few seconds early guarantees a keyframe at or before
//     the point the viewer asked for; the player starts playback at the real target.
const REMUX_PREROLL_S = 4
async function streamRemux(res, filePath, startSeconds, audioIndex) {
  let plan
  try {
    plan = await getStreamPlan(filePath)
  } catch (err) {
    res.statusCode = 500
    res.end(String(err))
    return
  }
  const copy = plan.videoMode === "copy"
  const seekTo = Math.max(0, startSeconds - (copy ? REMUX_PREROLL_S : 0))
  const withAudio = audioIndex >= 0 && audioIndex < plan.audioCount

  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-err_detect", "ignore_err",
    "-fflags", "+genpts",
    ...(seekTo > 0 ? ["-ss", seekTo.toFixed(3)] : []),
    "-copyts",
    "-i", filePath,
    "-map", "0:v:0",
    ...(withAudio ? ["-map", `0:a:${audioIndex}`] : []),
    "-sn", "-dn",
  ]

  if (copy) {
    args.push("-c:v", "copy")
  } else {
    const filters = []
    if (plan.video && plan.video.fieldOrder && plan.video.fieldOrder !== "progressive" && plan.video.fieldOrder !== "unknown") {
      filters.push("yadif=mode=0:deint=all")
    }
    // Never ship more than 1080p to a browser tab; keeps the encode realtime.
    filters.push("scale='min(1920,iw)':-2:flags=bicubic", "format=yuv420p")
    args.push(
      "-vf", filters.join(","),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      // No B-frames: pts == dts, so the muxer applies no composition shift, and
      // fragments can be cut cleanly every GOP.
      "-bf", "0", "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
      "-profile:v", "high", "-level:v", "4.1",
    )
  }

  if (withAudio) {
    args.push("-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k")
  }

  args.push(
    // No edit list: the timeline is then just tfdt + per-sample composition offsets,
    // which every browser reads the same way (see the timing note above).
    "-use_editlist", "0",
    "-avoid_negative_ts", "disabled",
    "-max_muxing_queue_size", "4096",
    "-movflags", "+frag_keyframe+empty_moov+default_base_moof+frag_discont+negative_cts_offsets",
    "-f", "mp4",
    "pipe:1",
  )
  pipeFfmpeg(res, args, "video/mp4")
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


// ---- PGS (Blu-ray bitmap) subtitles ----
// The image subtitles of a Blu-ray rip can't be turned into text, so they are handed
// to the client as-is (a .sup stream, PGS segments back to back) and drawn there
// (src/lib/pgs-subtitles.ts). Extracting one means demuxing the WHOLE file — subtitle
// packets are interleaved with the video all the way through, tens of GB for a
// remux. So it runs once, in the background at low priority, into a growing file,
// and requests are answered from whatever has been written so far: the viewer gets
// subtitles for the start of the film within moments instead of after the full pass,
// and the client keeps asking for what came after `offset` until it's complete.
const pgsJobs = new Map()

function pgsCachePath(filePath, subtitleIndex) {
  const key = createHash("sha1").update(`${filePath}::${subtitleIndex}::pgs`).digest("hex")
  return join(CACHE_DIR, `${key}.sup`)
}

// One ffmpeg pass writing every PGS track of the file (one demux, however many).
function startPgsExtraction(filePath, indices) {
  const wanted = indices.filter((index) => !existsSync(pgsCachePath(filePath, index)))
  if (wanted.length === 0) return null
  const existing = pgsJobs.get(filePath)
  if (existing) return existing

  const job = (async () => {
    await mkdir(CACHE_DIR, { recursive: true }).catch(() => {})
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", filePath]
    for (const index of wanted) {
      args.push("-map", `0:s:${index}`, "-c:s", "copy", "-flush_packets", "1", "-f", "sup", `${pgsCachePath(filePath, index)}.tmp`)
    }
    await new Promise((resolveRun) => {
      const child = spawnLowPriority("ffmpeg", args, { stdio: ["ignore", "ignore", "ignore"] })
      child.on("error", () => resolveRun())
      child.on("close", (code) => resolveRun(code))
    }).then(async (code) => {
      for (const index of wanted) {
        const finalPath = pgsCachePath(filePath, index)
        if (code === 0) await rename(`${finalPath}.tmp`, finalPath).catch(() => {})
        else await rm(`${finalPath}.tmp`, { force: true }).catch(() => {})
      }
    })
  })()
  pgsJobs.set(filePath, job)
  job.finally(() => pgsJobs.delete(filePath)).catch(() => {})
  return job
}

async function pgsTrackIndices(filePath) {
  try {
    const info = await probeTracks(filePath)
    return info.subtitleTracks.filter((track) => track.format === "pgs").map((track) => track.index)
  } catch {
    return []
  }
}

async function servePgs(res, filePath, subtitleIndex, offset) {
  const finalPath = pgsCachePath(filePath, subtitleIndex)
  let source = finalPath
  let complete = existsSync(finalPath)
  if (!complete) {
    const indices = await pgsTrackIndices(filePath)
    if (!indices.includes(subtitleIndex)) {
      res.statusCode = 404
      res.end("Not a PGS track")
      return
    }
    startPgsExtraction(filePath, indices)
    // The pass may have just finished and renamed its output.
    complete = existsSync(finalPath)
    source = complete ? finalPath : `${finalPath}.tmp`
  }
  let data
  try {
    data = await readFile(source)
  } catch {
    data = Buffer.alloc(0)
  }
  res.statusCode = 200
  res.setHeader("Content-Type", "application/octet-stream")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("X-Flick-Complete", complete ? "1" : "0")
  res.end(offset > 0 ? data.subarray(Math.min(offset, data.length)) : data)
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
      await runCapture("ffmpeg", args, { lowPriority: true })
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

// Resolve a font family the subtitle script asks for but that isn't embedded in
// the file (e.g. "Trebuchet MS") to a real installed font, via fontconfig's
// `fc-match` — the same substitution VLC and mpv do. Falls back to 404 (the
// client then lets libass use its bundled fallback) when fontconfig isn't
// available or matches nothing usable.
let fcMatchProbe = null
function fcMatchAvailable() {
  if (!fcMatchProbe) {
    fcMatchProbe = runCapture("fc-match", ["--version"]).then(() => true).catch(() => false)
  }
  return fcMatchProbe
}

async function serveSubtitleFont(res, family) {
  const name = (family || "").trim()
  if (!name) {
    res.statusCode = 400
    res.end("no family")
    return
  }
  await mkdir(FONT_CACHE_DIR, { recursive: true }).catch(() => {})
  const key = createHash("sha1").update(`fc::${name.toLowerCase()}`).digest("hex")
  for (const ext of [".ttf", ".otf", ".ttc", ".woff2"]) {
    const cached = await readCached(join(FONT_CACHE_DIR, `${key}${ext}`))
    if (cached) {
      res.statusCode = 200
      res.setHeader("Content-Type", FONT_MIME_TYPES[ext] || "font/ttf")
      res.end(cached)
      return
    }
  }
  if (!(await fcMatchAvailable())) {
    res.statusCode = 404
    res.end("no fontconfig")
    return
  }
  try {
    const out = (await runCapture("fc-match", ["-f", "%{file}", name])).toString("utf8").trim()
    if (!out || !existsSync(out)) {
      res.statusCode = 404
      res.end("no match")
      return
    }
    const ext = (extname(out) || ".ttf").toLowerCase()
    const data = await readFile(out)
    await writeFile(join(FONT_CACHE_DIR, `${key}${ext}`), data).catch(() => {})
    res.statusCode = 200
    res.setHeader("Content-Type", FONT_MIME_TYPES[ext] || "font/ttf")
    res.end(data)
  } catch {
    res.statusCode = 404
    res.end("fc-match failed")
  }
}

// Scrub-bar hover preview — a single small JPEG frame near the requested second.
// `-ss` before `-i` does a fast, keyframe-level (not frame-accurate) seek, which
// is exactly the tradeoff scrubbing wants: near-instant response over exactness.
// Cached to disk per (file, whole second) so repeatedly hovering the same spot
// never re-invokes ffmpeg.
function thumbnailCachePathAt(filePath, seconds) {
  const cacheKey = createHash("sha1").update(`${filePath}::${seconds}`).digest("hex")
  return join(THUMB_CACHE_DIR, `${cacheKey}.jpg`)
}

async function extractThumbnail(filePath, seconds, options) {
  const jpeg = await runCapture("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-ss", String(seconds),
    "-i", filePath,
    "-frames:v", "1",
    "-q:v", "4",
    "-vf", `scale=${THUMBNAIL_WIDTH}:-2`,
    "-f", "mjpeg",
    "pipe:1",
  ], options)
  if (jpeg.length === 0) throw new Error("empty frame")
  return jpeg
}

async function serveThumbnail(res, filePath, seconds) {
  await mkdir(THUMB_CACHE_DIR, { recursive: true }).catch(() => {})
  const cachePath = thumbnailCachePathAt(filePath, seconds)
  const cached = await readCached(cachePath)
  if (cached) {
    res.statusCode = 200
    res.setHeader("Content-Type", "image/jpeg")
    res.setHeader("Cache-Control", "public, max-age=86400")
    res.end(cached)
    return
  }
  try {
    const jpeg = await extractThumbnail(filePath, seconds)
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
// Decoding a file end to end just to sample a frame every few seconds is fine for a
// 1 GB episode and ruinous for a 27 GB Blu-ray remux: minutes of a fully loaded CPU
// and the whole file streamed off the disk, competing with the movie being watched.
// Big files, and MPEG-TS in general (no index to seek by), instead get one cheap
// keyframe seek per thumbnail — a few hundred tiny reads — at low priority.
const THUMBNAIL_SEEK_MODE_BYTES = 3 * 1024 * 1024 * 1024
const THUMBNAIL_SEEK_MODE_EXTENSIONS = new Set([".m2ts", ".mts", ".ts", ".mpg", ".mpeg"])
// Let playback claim the disk first; nobody scrubs in the first seconds.
const THUMBNAIL_SEEK_START_DELAY_MS = 8000

function useSeekThumbnails(filePath) {
  if (THUMBNAIL_SEEK_MODE_EXTENSIONS.has(extname(filePath).toLowerCase())) return true
  try {
    return statSync(filePath).size >= THUMBNAIL_SEEK_MODE_BYTES
  } catch {
    return false
  }
}

async function pregenerateThumbnailsBySeeking(filePath, duration, interval, markerPath) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, THUMBNAIL_SEEK_START_DELAY_MS))
  await mkdir(THUMB_CACHE_DIR, { recursive: true }).catch(() => {})
  let made = 0
  for (let second = 0; second < duration; second += interval) {
    const cachePath = thumbnailCachePathAt(filePath, second)
    if (existsSync(cachePath)) continue
    try {
      await writeFile(cachePath, await extractThumbnail(filePath, second, { lowPriority: true }))
      made++
    } catch {
      // A frame that can't be extracted just stays a cache miss (served live on hover).
    }
  }
  await writeFile(markerPath, String(made)).catch(() => {})
}

async function pregenerateThumbnails(filePath, duration) {
  const interval = thumbnailInterval(duration)
  const markerPath = join(
    THUMB_CACHE_DIR,
    createHash("sha1").update(`${filePath}::manifest::${interval}`).digest("hex") + ".done"
  )
  if (existsSync(markerPath)) return
  if (thumbnailPregenJobs.has(filePath)) return thumbnailPregenJobs.get(filePath)

  if (useSeekThumbnails(filePath)) {
    const seekJob = pregenerateThumbnailsBySeeking(filePath, duration, interval, markerPath).finally(() =>
      thumbnailPregenJobs.delete(filePath)
    )
    thumbnailPregenJobs.set(filePath, seekJob)
    return seekJob
  }

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

      const child = spawnLowPriority("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin",
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


// ---- Per-title audio/subtitle preferences ----
// Stored server-side (one small JSON file) instead of only in the browser's
// localStorage, which is scoped to origin: a different dev port, another browser or
// cleared site data would silently forget every choice. Keys are file-based (see
// media-prefs.ts), so a choice stays attached to that exact movie.
async function readPrefsStore() {
  try {
    const parsed = JSON.parse(await readFile(PREFS_FILE, "utf8"))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// Writes are serialised and atomic (temp file + rename) so two quick changes, or a
// crash mid-write, can never leave a truncated file that would drop every preference.
let prefsWriteChain = Promise.resolve()
function updatePrefsStore(entries) {
  prefsWriteChain = prefsWriteChain
    .then(async () => {
      const current = await readPrefsStore()
      for (const [key, value] of entries) {
        const previous = current[key]
        if (!previous || (value.updatedAt || 0) >= (previous.updatedAt || 0)) current[key] = value
      }
      await mkdir(dirname(PREFS_FILE), { recursive: true })
      const tmp = `${PREFS_FILE}.tmp`
      await writeFile(tmp, JSON.stringify(current, null, 2))
      await rename(tmp, PREFS_FILE)
    })
    .catch(() => {})
  return prefsWriteChain
}

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let size = 0
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > limitBytes) {
        rejectBody(new Error("Body too large"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"))
      } catch (err) {
        rejectBody(err)
      }
    })
    req.on("error", rejectBody)
  })
}

async function handlePrefsRequest(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, { prefs: await readPrefsStore() })
    return
  }
  if (req.method === "PUT" || req.method === "POST") {
    try {
      const body = await readJsonBody(req)
      const entries = Object.entries(body?.entries && typeof body.entries === "object" ? body.entries : {})
        .filter(([key, value]) => typeof key === "string" && key.length > 0 && key.length <= 1024 && value && typeof value === "object")
      await updatePrefsStore(entries)
      sendJson(res, 200, { ok: true, saved: entries.length })
    } catch (err) {
      sendJson(res, 400, { ok: false, error: String(err) })
    }
    return
  }
  res.statusCode = 405
  res.end()
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

// Astro/Vite load `.env` into `import.meta.env` for app code only — this plugin runs
// in the Node config process, where `process.env` never sees it. Read the env files
// ourselves so `LOCAL_MOVIES_DIR` in `.env` works as the docs (and the error message
// below) promise. Values already present in the real environment win.
function loadEnvFiles() {
  const root = fileURLToPath(new URL("../", import.meta.url))
  /** @type {Record<string, string>} */
  const values = {}
  // Later files override earlier ones, matching Vite's own .env precedence.
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    let raw
    try {
      raw = readFileSync(join(root, name), "utf8")
    } catch {
      continue
    }
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      let value = match[2].trim()
      // Strip matching quotes; an unquoted value keeps everything up to a ` #` comment.
      if (/^"(.*)"$/s.test(value) || /^'(.*)'$/s.test(value)) value = value.slice(1, -1)
      else value = value.replace(/\s+#.*$/, "").trim()
      values[match[1]] = value
    }
  }
  return values
}

// The same checkout is used from Windows and from Linux, where the library lives at
// completely different paths (`D:\Peliculas` vs `/mnt/media/Peliculas`). Accept a
// per-platform override first, then a `|`-separated candidate list in LOCAL_MOVIES_DIR
// so a single committed .env can name both paths and each OS picks the one that exists.
// `|` is illegal in Windows paths and vanishingly rare on POSIX, unlike `;`/`:` whose
// meaning as a path separator flips between the two platforms.
const PLATFORM_DIR_VARS = {
  win32: "LOCAL_MOVIES_DIR_WINDOWS",
  linux: "LOCAL_MOVIES_DIR_LINUX",
  darwin: "LOCAL_MOVIES_DIR_MAC",
}

function findConfiguredLibraryDir() {
  const fileEnv = loadEnvFiles()
  const read = (/** @type {string} */ name) => (process.env[name] || fileEnv[name] || "").trim()

  const platformVar = PLATFORM_DIR_VARS[/** @type {keyof typeof PLATFORM_DIR_VARS} */ (process.platform)]
  const candidates = [...(platformVar ? [read(platformVar)] : []), ...read("LOCAL_MOVIES_DIR").split("|")]
    .map((value) => value.trim())
    .filter(Boolean)

  if (candidates.length === 0) return null
  // Several paths configured (one per machine) — use the first that exists here, and
  // fall back to the first one overall so the error can name what was actually set.
  return candidates.find((candidate) => isDir(candidate)) || candidates[0]
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

  // Linux. Mount points first, then the home folder — including the Spanish names
  // a localised desktop creates ("Vídeos"), and WSL's /mnt/<drive letter> view of
  // the Windows disks, which is where the same library shows up from a WSL checkout.
  const onRunMedia = findLibraryUnder("/run/media", 2) // /run/media/<user>/<disk>/Peliculas
  if (onRunMedia) return onRunMedia
  const onMedia = findLibraryUnder("/media", 2) // /media/<disk>/Peliculas or /media/<user>/<disk>/Peliculas
  if (onMedia) return onMedia
  const onMnt = findLibraryUnder("/mnt", 2) // /mnt/<disk>/Peliculas or /mnt/d/Peliculas under WSL
  if (onMnt) return onMnt
  const onSrv = findLibraryUnder("/srv") // /srv/<share>/Peliculas
  if (onSrv) return onSrv
  const candidates = [
    join("/mnt", LIBRARY_FOLDER_NAME),
    join("/media", LIBRARY_FOLDER_NAME),
    join("/srv", LIBRARY_FOLDER_NAME),
    join(home, LIBRARY_FOLDER_NAME),
    join(home, "Películas"),
    ...["Videos", "Vídeos", "Movies", "media"].map((dir) => join(home, dir, LIBRARY_FOLDER_NAME)),
  ]
  for (const candidate of candidates) {
    if (isDir(candidate)) return candidate
  }
  return null
}

export function localMediaDevPlugin() {
  const resolvedDir = findConfiguredLibraryDir() || findDefaultLibraryDir()
  const baseDir = resolvedDir ? normalize(resolvedDir) : null
  const platformVar = PLATFORM_DIR_VARS[/** @type {keyof typeof PLATFORM_DIR_VARS} */ (process.platform)]
  // Point at the per-platform variable so a checkout shared between Windows and Linux
  // can carry both paths instead of one machine overwriting the other's .env.
  const howToConfigure =
    `Set LOCAL_MOVIES_DIR in your .env file to the path of your "${LIBRARY_FOLDER_NAME}" folder` +
    (platformVar ? ` (or ${platformVar} for a path that only applies on this OS).` : ".")

  return {
    name: "flick-local-media-dev",
    apply: /** @type {"serve"} */ ("serve"), // dev server only — never included in `astro build`
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(LIBRARY_API_PATH)) return next()
        if (!baseDir || !existsSync(baseDir)) {
          const error = baseDir
            ? `Directory not found on ${process.platform}: ${baseDir}. ${howToConfigure}`
            : `No movie library found automatically. ${howToConfigure}`
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
          prewarmSubtitles(filePath, info.subtitleTracks.filter((track) => track.format !== "pgs")).catch(() => {})
          startPgsExtraction(filePath, info.subtitleTracks.filter((track) => track.format === "pgs").map((track) => track.index))
        } catch (err) {
          sendJson(res, 500, { audioTracks: [], subtitleTracks: [], chapters: [], duration: 0, error: String(err) })
        }
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(SUBTITLE_PGS_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(SUBTITLE_PGS_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        const streamParam = url.searchParams.get("stream")
        if (!filePath || streamParam === null || Number.isNaN(Number(streamParam))) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        await servePgs(res, filePath, Number(streamParam), Math.max(0, Number(url.searchParams.get("offset")) || 0))
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
        if (!req.url || !req.url.startsWith(SUBTITLE_FONT_API_PATH)) return next()
        const url = new URL(req.url, "http://localhost")
        await serveSubtitleFont(res, url.searchParams.get("family") || "")
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
        if (!req.url || !req.url.startsWith(PREFS_API_PATH)) return next()
        await handlePrefsRequest(req, res)
      })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(REMUX_API_PREFIX)) return next()
        const url = new URL(req.url, "http://localhost")
        const encodedRelPath = url.pathname.slice(REMUX_API_PREFIX.length)
        const filePath = resolveLibraryPath(baseDir, encodedRelPath)
        if (!filePath) {
          res.statusCode = 400
          res.end("Invalid path")
          return
        }
        const startSeconds = Math.max(0, Number(url.searchParams.get("start")) || 0)
        const audioParam = url.searchParams.get("audio")
        const audioIndex = audioParam === null || Number.isNaN(Number(audioParam)) ? 0 : Number(audioParam)
        await streamRemux(res, filePath, startSeconds, audioIndex)
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
