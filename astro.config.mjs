// @ts-check

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import {
  readFileSync,
  statSync,
  existsSync,
  createReadStream,
  mkdirSync,
  writeFileSync,
} from "node:fs"
import { extname, join, resolve, relative } from "node:path"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"

/** Serve and adapt files from F:\Peliculas for browser playback. */
function localMediaPlugin() {
  const MOVIE_DIR = "F:\\Peliculas"
  const CACHE_DIR = resolve(".media-cache")
  const hlsJobs = new Map()

  mkdirSync(CACHE_DIR, { recursive: true })

  /** @type {Record<string, string>} */
  const MIME_TYPES = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".webm": "video/webm",
    ".m4v": "video/mp4",
    ".srt": "text/plain; charset=utf-8",
    ".vtt": "text/vtt; charset=utf-8",
    ".ass": "text/plain; charset=utf-8",
    ".ssa": "text/plain; charset=utf-8",
  }

  function srtToVtt(/** @type {string} */ srt) {
    const body = srt
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
      .replace(/\{\\[^}]+\}/g, "")
      .replace(/<\/?font\b[^>]*>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    return body.startsWith("WEBVTT") ? `${body}\n` : `WEBVTT\n\n${body}\n`
  }

  function safeMoviePath(/** @type {string} */ fileName) {
    const root = resolve(MOVIE_DIR)
    const candidate = resolve(root, fileName)
    const rel = relative(root, candidate)
    if (!rel || rel.startsWith("..")) return null
    return candidate
  }

  function probeStreams(/** @type {string} */ filePath) {
    return JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", filePath],
        { encoding: "utf-8", timeout: 15000, windowsHide: true }
      )
    )
  }

  function getHlsInfo(/** @type {string} */ filePath) {
    const result = probeStreams(filePath)
    const audioTracks = []
    let videoTrack = null

    for (const stream of result.streams || []) {
      if (
        stream.codec_type === "video" &&
        stream.disposition?.attached_pic !== 1 &&
        !videoTrack
      ) {
        videoTrack = stream
      } else if (stream.codec_type === "audio") {
        audioTracks.push({
          index: stream.index,
          language: stream.tags?.language || "und",
          codec: stream.codec_name,
          title: stream.tags?.title || "",
        })
      }
    }

    return { audioTracks, videoTrack }
  }

  function startHlsJob(/** @type {string} */ filePath, /** @type {string} */ cachePath) {
    const doneFile = join(cachePath, ".done")
    if (existsSync(doneFile) || hlsJobs.has(cachePath)) return

    mkdirSync(cachePath, { recursive: true })

    let media
    try {
      media = getHlsInfo(filePath)
    } catch (error) {
      writeFileSync(join(cachePath, ".error"), String(error), "utf-8")
      return
    }

    if (!media.videoTrack || media.audioTracks.length === 0) {
      writeFileSync(join(cachePath, ".error"), "No se encontró video o audio", "utf-8")
      return
    }

    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", filePath]

    for (const track of media.audioTracks) {
      args.push("-map", `0:${track.index}`)
    }
    args.push("-map", "0:v:0")

    const canCopyVideo =
      media.videoTrack.codec_name === "h264" &&
      ["yuv420p", "yuvj420p"].includes(media.videoTrack.pix_fmt)

    if (canCopyVideo) {
      args.push("-c:v", "copy")
    } else {
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p"
      )
    }

    args.push("-c:a", "aac", "-b:a", "192k", "-ac", "2")

    const variants = media.audioTracks.map((track, index) => {
      const language = String(track.language || "und").replace(/[^a-zA-Z0-9-]/g, "") || "und"
      const isDefault = index === 0 ? ",default:yes" : ""
      return `a:${index},agroup:audio,language:${language}${isDefault}`
    })
    variants.push("v:0,agroup:audio")

    args.push(
      "-f",
      "hls",
      "-hls_time",
      "3",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "event",
      "-hls_flags",
      "independent_segments+append_list+temp_file",
      "-master_pl_name",
      "master.m3u8",
      "-master_pl_publish_rate",
      "1",
      "-var_stream_map",
      variants.join(" "),
      "-hls_segment_filename",
      join(cachePath, "segment_%v_%05d.ts"),
      join(cachePath, "stream_%v.m3u8")
    )

    const child = spawn("ffmpeg", args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    hlsJobs.set(cachePath, child)

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000)
    })
    child.on("error", (error) => {
      hlsJobs.delete(cachePath)
      writeFileSync(join(cachePath, ".error"), String(error), "utf-8")
    })
    child.on("close", (code) => {
      hlsJobs.delete(cachePath)
      if (code === 0) {
        writeFileSync(doneFile, "ok", "utf-8")
      } else {
        writeFileSync(
          join(cachePath, ".error"),
          stderr || `ffmpeg terminó con código ${code}`,
          "utf-8"
        )
      }
    })
  }

  function sendWhenReady(
    /** @type {string} */ filePath,
    /** @type {string} */ contentType,
    /** @type {import("node:http").ServerResponse} */ res,
    attempts = 0
  ) {
    if (existsSync(filePath)) {
      const stats = statSync(filePath)
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stats.size,
        "Cache-Control": contentType.includes("mpegurl")
          ? "no-store"
          : "public, max-age=31536000",
      })
      createReadStream(filePath).pipe(res)
      return
    }

    const errorFile = join(filePath, "..", ".error")
    if (existsSync(errorFile)) {
      res.statusCode = 500
      res.end(readFileSync(errorFile, "utf-8"))
      return
    }

    if (attempts >= 900) {
      res.statusCode = 504
      res.end("La conversión multimedia tardó demasiado")
      return
    }

    setTimeout(() => sendWhenReady(filePath, contentType, res, attempts + 1), 100)
  }

  function serveFile(
    /** @type {string} */ urlPath,
    /** @type {import("node:http").IncomingMessage} */ req,
    /** @type {import("node:http").ServerResponse} */ res
  ) {
    const prefix = urlPath.startsWith("/media/") ? "/media/" : "/subs/"
    const fileName = decodeURIComponent(urlPath.slice(prefix.length))
    const safePath = safeMoviePath(fileName)
    if (!safePath) { res.statusCode = 403; res.end("Forbidden"); return }
    if (!existsSync(safePath)) { res.statusCode = 404; res.end("Not found"); return }
    if (statSync(safePath).isDirectory()) { res.statusCode = 400; res.end("Is a directory"); return }

    const ext = extname(safePath).toLowerCase()
    const stats = statSync(safePath)
    const fileSize = stats.size

    if (prefix === "/subs/") {
      const data = readFileSync(safePath, "utf-8")
      const body = ext === ".srt" ? srtToVtt(data) : data
      res.writeHead(200, {
        "Content-Type": "text/vtt; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Length": Buffer.byteLength(body),
      })
      res.end(body)
      return
    }

    const mime = MIME_TYPES[ext] || "application/octet-stream"
    const range = req.headers?.range

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const endRaw = parts[1]
      const end = endRaw && endRaw.length > 0 ? parseInt(endRaw, 10) : fileSize - 1
      const chunkSize = end - start + 1
      const stream = createReadStream(safePath, { start, end })
      res.writeHead(206, {
        "Content-Type": mime,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunkSize,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      })
      stream.pipe(res)
    } else {
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      })
      createReadStream(safePath).pipe(res)
    }
  }

  function installMiddleware(
    /** @type {{ middlewares: { use: (handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => void) => void } }} */ server
  ) {
    server.middlewares.use((req, res, next) => {
      const url = req.url || ""

      if (url === "/api/config") {
        let dataSource = "local"
        try {
          const envContent = readFileSync(join(import.meta.dirname, ".env"), "utf-8")
          const match = envContent.match(/^DATA_SOURCE\s*=\s*(\S+)/m)
          if (match) dataSource = match[1]
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ dataSource }))
        return
      }

      if (url.startsWith("/api/subtracks/")) {
        const filePath = decodeURIComponent(url.slice("/api/subtracks/".length))
        const safePath = safeMoviePath(filePath)
        if (!safePath) { res.statusCode = 403; res.end("Forbidden"); return }
        if (!existsSync(safePath)) { res.statusCode = 404; res.end("Not found"); return }

        try {
          const result = probeStreams(safePath)
          const audioTracks = []
          const subTracks = []
          for (const stream of result.streams || []) {
            if (stream.codec_type === "audio") {
              audioTracks.push({
                index: stream.index,
                language: stream.tags?.language || "und",
                codec: stream.codec_name,
                title: stream.tags?.title || "",
              })
            } else if (stream.codec_type === "subtitle") {
              subTracks.push({
                index: stream.index,
                language: stream.tags?.language || "und",
                codec: stream.codec_name,
                title: stream.tags?.title || "",
              })
            }
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          })
          const durationSeconds = Number(result.format?.duration) || 0
          res.end(JSON.stringify({ audioTracks, subTracks, durationSeconds }))
        } catch (error) {
          res.statusCode = 500
          res.end("Probe failed: " + String(error))
        }
        return
      }

      if (url.startsWith("/api/stream/")) {
        const match = url.match(/^\/api\/stream\/(.+)\/([^/]+)$/)
        if (!match) { res.statusCode = 400; res.end("Bad request"); return }

        const filePath = decodeURIComponent(match[1])
        const assetName = match[2]
        if (!/^(master|stream_\d+)\.m3u8$|^segment_\d+_\d+\.ts$/.test(assetName)) {
          res.statusCode = 400
          res.end("Bad asset")
          return
        }

        const safePath = safeMoviePath(filePath)
        if (!safePath) { res.statusCode = 403; res.end("Forbidden"); return }
        if (!existsSync(safePath)) { res.statusCode = 404; res.end("Not found"); return }

        const stats = statSync(safePath)
        const cacheKey = createHash("sha1")
          .update(`${safePath}:${stats.size}:${stats.mtimeMs}`)
          .digest("hex")
        const cachePath = join(CACHE_DIR, cacheKey)
        startHlsJob(safePath, cachePath)

        const contentType = assetName.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : "video/mp2t"
        sendWhenReady(join(cachePath, assetName), contentType, res)
        return
      }

      if (url.startsWith("/api/sub-extract/")) {
        const match = url.match(/^\/api\/sub-extract\/(.+)\/(\d+)\.(vtt|ass)$/)
        if (!match) { res.statusCode = 400; res.end("Bad request"); return }
        const filePath = decodeURIComponent(match[1])
        const streamIndex = parseInt(match[2], 10)
        const ext = match[3] // "vtt" or "ass"
        const safePath = safeMoviePath(filePath)
        if (!safePath) { res.statusCode = 403; res.end("Forbidden"); return }
        if (!existsSync(safePath)) { res.statusCode = 404; res.end("Not found"); return }

        // Cache extracted subtitles
        const stats = statSync(safePath)
        const cacheKey = createHash("sha1").update(`${safePath}:${streamIndex}:${stats.size}:${stats.mtimeMs}:${ext}`).digest("hex")
        const cacheDir = join(CACHE_DIR, "subs", cacheKey)
        const outFile = join(cacheDir, `sub.${ext}`)
        if (!existsSync(outFile)) {
          try {
            mkdirSync(cacheDir, { recursive: true })
            if (ext === "ass") {
              execFileSync(
                "ffmpeg",
                ["-v", "quiet", "-i", safePath, "-map", `0:${streamIndex}`, "-c:s", "ass", "-f", "ass", outFile],
                { timeout: 60000, windowsHide: true }
              )
            } else {
              const srtBuffer = execFileSync(
                "ffmpeg",
                ["-v", "quiet", "-i", safePath, "-map", `0:${streamIndex}`, "-f", "srt", "-"],
                { encoding: "buffer", timeout: 60000, windowsHide: true }
              )
              writeFileSync(outFile, srtToVtt(srtBuffer.toString("utf-8")), "utf-8")
            }
          } catch (error) {
            res.statusCode = 500
            res.end("Extraction failed: " + String(error))
            return
          }
        }
        const cached = readFileSync(outFile, "utf-8")
        const contentType = ext === "ass" ? "text/plain; charset=utf-8" : "text/vtt; charset=utf-8"
        res.writeHead(200, {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Content-Length": Buffer.byteLength(cached),
        })
        res.end(cached)
        return
      }

      if (url.startsWith("/media/") || url.startsWith("/subs/")) {
        serveFile(url, req, res)
      } else {
        next()
      }
    })
  }

  return {
    name: "local-media",
    configureServer(/** @type {{ middlewares: { use: (handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => void) => void } }} */ server) {
      installMiddleware(server)
    },
    configurePreviewServer(/** @type {{ middlewares: { use: (handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => void) => void } }} */ server) {
      installMiddleware(server)
    },
  }
}

export default defineConfig({
  vite: {
    plugins: [tailwindcss(), localMediaPlugin()],
    server: {
      fs: {
        allow: [".", "F:\\Peliculas"],
      },
    },
  },
  integrations: [react()],
})