// Dev-only Vite middleware that exposes the local movie library on disk so `npm run dev`
// can browse and stream real files instead of TMDB trailers. Registered with `apply: "serve"`
// so it never runs (and never ships) during `astro build` / production.
import { createReadStream, existsSync, statSync } from "node:fs"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { extname, join, normalize, relative, resolve, sep } from "node:path"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"

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

const DEFAULT_LIBRARY_DIR = "/run/media/cristhobal/Disco Duro/Peliculas"
const LIBRARY_API_PATH = "/api/local-library"
const VIDEO_API_PREFIX = "/api/local-video/"
const AUDIO_API_PREFIX = "/api/local-audio/"
const VIDEO_INFO_API_PATH = "/api/local-video-info"
const SUBTITLE_API_PREFIX = "/api/local-subtitle/"
const SUBTITLE_RAW_API_PREFIX = "/api/local-subtitle-raw/"
const FONT_API_PREFIX = "/api/local-font/"
const CACHE_DIR = resolve(process.cwd(), ".media-cache", "subs")
const FONT_CACHE_DIR = resolve(process.cwd(), ".media-cache", "fonts")
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
function parseEpisode(name) {
  const base = stripExt(name)
  const match = base.match(/^E(\d+)\s*-?\s*(.*)$/i)
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
    "-of", "json",
    filePath,
  ])
  const data = JSON.parse(output.toString("utf8"))
  const streams = Array.isArray(data.streams) ? data.streams : []
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
        subtitleTracks.push({
          index: subtitleTypeIndex,
          codec: stream.codec_name,
          format: STYLED_SUBTITLE_CODECS.has(stream.codec_name) ? "ass" : "vtt",
          language: tags.language || "",
          title: tags.title || "",
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
  return { audioTracks, subtitleTracks, fonts, duration }
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
    ...(startSeconds > 0 ? ["-ss", startSeconds.toFixed(3)] : []),
    "-i", filePath,
    "-map", `0:a:${audioIndex}`,
    "-vn", "-sn",
    "-c:a", "aac", "-ac", "2", "-b:a", "192k",
    "-avoid_negative_ts", "make_zero",
    "-f", "adts",
    "pipe:1",
  ]
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] })
  res.statusCode = 200
  res.setHeader("Content-Type", "audio/aac")
  child.stdout.pipe(res)
  child.stderr.on("data", () => {}) // drain to avoid backpressure on stderr
  child.on("error", () => { if (!res.headersSent) { res.statusCode = 500 } res.end() })
  res.on("close", () => child.kill("SIGKILL"))
}

async function readCached(cachePath) {
  try {
    return await readFile(cachePath)
  } catch {
    return null
  }
}

async function serveSubtitle(res, filePath, subtitleIndex) {
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => {})
  const cacheKey = createHash("sha1").update(`${filePath}::${subtitleIndex}`).digest("hex")
  const cachePath = join(CACHE_DIR, `${cacheKey}.vtt`)
  const cached = await readCached(cachePath)
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
  const cached = await readCached(cachePath)
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

export function localMediaDevPlugin() {
  const baseDir = normalize(process.env.LOCAL_MOVIES_DIR || DEFAULT_LIBRARY_DIR)

  return {
    name: "flick-local-media-dev",
    apply: /** @type {"serve"} */ ("serve"), // dev server only — never included in `astro build`
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(LIBRARY_API_PATH)) return next()
        if (!existsSync(baseDir)) {
          sendJson(res, 200, { movies: [], series: [], animeMovies: [], animeSeries: [], error: `Directory not found: ${baseDir}` })
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
        } catch (err) {
          sendJson(res, 500, { audioTracks: [], subtitleTracks: [], duration: 0, error: String(err) })
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
