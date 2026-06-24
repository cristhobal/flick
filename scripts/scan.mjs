import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join, extname } from "node:path"
import { execSync } from "node:child_process"

// Skip scan if DATA_SOURCE=tmdb
try {
  const envContent = readFileSync(join(import.meta.dirname, "..", ".env"), "utf-8")
  const match = envContent.match(/^DATA_SOURCE\s*=\s*(\S+)/m)
  if (match && match[1] === "tmdb") {
    console.log("DATA_SOURCE=tmdb — omitiendo escaneo de archivos locales")
    process.exit(0)
  }
} catch {}

const MOVIE_DIR = "F:\\Peliculas"
const OUT_FILE = join(import.meta.dirname, "..", "public", "movies.json")

// TMDB
const TMDB_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkYzM4NDY3Y2I2YmEyYTVlYWE2ZTk3ODRjZWZjZGJjYyIsIm5iZiI6MTc4MjI0Nzk1OS4yNzIsInN1YiI6IjZhM2FmMjE3YTYzMmUzNDdiNzNjZTJiMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.f5ry-jA-1B6mtriBrYELdvCpf8UQwU050CWEAb9JcWw"
const TMDB_BASE = "https://api.themoviedb.org/3"

async function tmdbFetch(endpoint) {
  const res = await fetch(`${TMDB_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" },
  })
  if (!res.ok) return null
  return res.json()
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function selectBestMovieResult(results, requestedTitle, requestedYear) {
  const normalizedRequest = normalizeTitle(requestedTitle)
  const requestNumbers = normalizedRequest.match(/\b\d+\b/g) || []

  return [...results].sort((a, b) => {
    const score = (candidate) => {
      const candidateTitle = normalizeTitle(
        `${candidate.title || ""} ${candidate.original_title || ""}`
      )
      const yearStr = (candidate.release_date || "").slice(0, 4)
      const candidateYear = yearStr ? Number(yearStr) : NaN
      let value = 0

      // Exact year match
      if (candidateYear === requestedYear) value += 100
      // Year proximity bonus (when no exact match exists)
      else if (!isNaN(candidateYear) && !isNaN(requestedYear)) {
        const diff = Math.abs(candidateYear - requestedYear)
        if (diff === 1) value += 30
        else if (diff <= 3) value += 15
      }

      // Title match
      if (candidateTitle === normalizedRequest) value += 80
      else if (candidateTitle.includes(normalizedRequest)) value += 45
      else if (normalizedRequest.includes(normalizeTitle(candidate.title))) value += 25

      // Request number matching (penalize missing sequel numbers)
      for (const number of requestNumbers) {
        value += new RegExp(`\\b${number}\\b`).test(candidateTitle) ? 35 : -35
      }

      // Sequel detection: extra number in candidate title (not year) = sequel indicator
      const candidateNumbers = candidateTitle.match(/\b\d+\b/g) || []
      for (const num of candidateNumbers) {
        if (!requestNumbers.includes(num) && Number(num) < 100) {
          value += 30
        }
      }

      return value
    }

    return score(b) - score(a)
  })[0]
}
async function lookupMovieTMDB(title, year) {
  let data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(title)}&year=${year}&language=es-MX`)
  let results = data?.results?.filter((movie) => movie.poster_path || movie.backdrop_path) || []

  if (results.length === 0) {
    data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(title)}&year=${year}&language=en-US`)
    results = data?.results?.filter((movie) => movie.poster_path || movie.backdrop_path) || []
  }

  if (results.length === 0) {
    data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(title)}&language=es-MX`)
    results = data?.results?.filter((movie) => movie.poster_path || movie.backdrop_path) || []
  }

  if (results.length === 0) {
    data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(title)}&language=en-US`)
    results = data?.results?.filter((movie) => movie.poster_path || movie.backdrop_path) || []
  }

  if (results.length === 0) {
    const stripped = title.replace(/\s+\d+$/, "").trim()
    if (stripped && stripped !== title) {
      data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(stripped)}&language=es-MX`)
      results = data?.results?.filter((movie) => movie.poster_path || movie.backdrop_path) || []
    }
  }

  if (results.length === 0) return null

  let best = selectBestMovieResult(results, title, year)

  // Re-search if best match has wrong year (likely a sequel with different title)
  const bestReleaseYear = (best.release_date || "").slice(0, 4)
  const bestYearNum = bestReleaseYear ? Number(bestReleaseYear) : NaN
  if (bestYearNum !== year && year > 0 && best.original_title) {
    const altQuery = best.original_title
    if (normalizeTitle(altQuery) !== normalizeTitle(title)) {
      const altData = await tmdbFetch(`/search/movie?query=${encodeURIComponent(altQuery)}&year=${year}&language=en-US`)
      const altResults = altData?.results?.filter((movie) => movie.poster_path || movie.backdrop_path) || []
      if (altResults.length > 0) {
        const altBest = selectBestMovieResult(altResults, altQuery, year)
        const altYear = Number((altBest.release_date || "").slice(0, 4))
        if (altYear === year) best = altBest
      }
    }
  }

  const detail = await tmdbFetch(`/movie/${best.id}?language=es-MX`)

  // Try to find a Spanish title via alternative titles when TMDB returns English
  let finalTitle = (detail?.title || best.title || title).trim()
  const origTitle = (detail?.original_title || "").trim()
  if (origTitle && finalTitle === origTitle && finalTitle !== title) {
    const altData = await tmdbFetch(`/movie/${best.id}/alternative_titles`)
    const esAlt = altData?.titles?.find(
      (t) => t.iso_3166_1 === "ES" || t.iso_3166_1 === "MX"
    )
    if (esAlt) finalTitle = esAlt.title
  }

  // Use overview in Spanish if available, otherwise fall back to original English
  const overview = (detail?.overview || best.overview || "").trim()

  return {
    tmdbId: best.id,
    title: finalTitle,
    originalTitle: origTitle,
    posterPath: detail?.poster_path || best.poster_path,
    backdropPath: detail?.backdrop_path || best.backdrop_path || best.poster_path,
    overview,
    rating: best.vote_average ? Math.round(best.vote_average * 10) / 10 : 0,
    genres: detail?.genres?.map((genre) => genre.name).slice(0, 2).join(", ") || "",
    mediaType: "movie",
  }
}

async function lookupSeriesTMDB(title) {
  let mediaType = "tv"
  let data = await tmdbFetch(`/search/tv?query=${encodeURIComponent(title)}&language=es-MX`)
  let results = data?.results?.filter((item) => item.poster_path || item.backdrop_path) || []

  if (results.length === 0) {
    data = await tmdbFetch(`/search/tv?query=${encodeURIComponent(title)}&language=en-US`)
    results = data?.results?.filter((item) => item.poster_path || item.backdrop_path) || []
  }

  if (results.length === 0) {
    mediaType = "movie"
    data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(title)}&language=es-MX`)
    results = data?.results?.filter((item) => item.poster_path || item.backdrop_path) || []
  }

  if (results.length === 0) return null

  const best = results[0]
  if (mediaType === "tv") {
    const detail = await tmdbFetch(`/tv/${best.id}?language=es-MX`)
    return {
      tmdbId: best.id,
      title: (detail?.name || best.name || title).trim(),
      originalTitle: (detail?.original_name || best.original_name || "").trim(),
      posterPath: detail?.poster_path || best.poster_path,
      backdropPath: detail?.backdrop_path || best.backdrop_path || best.poster_path,
      overview: (detail?.overview || best.overview || "").trim(),
      rating: best.vote_average ? Math.round(best.vote_average * 10) / 10 : 0,
      genres: detail?.genres?.map((genre) => genre.name).slice(0, 2).join(", ") || "",
      mediaType: "tv",
    }
  }

  const detail = await tmdbFetch(`/movie/${best.id}?language=es-MX`)
  return {
    tmdbId: best.id,
    title: (detail?.title || best.title || title).trim(),
    originalTitle: (detail?.original_title || best.original_title || "").trim(),
    posterPath: detail?.poster_path || best.poster_path,
    backdropPath: detail?.backdrop_path || best.backdrop_path || best.poster_path,
    overview: (detail?.overview || best.overview || "").trim(),
    rating: best.vote_average ? Math.round(best.vote_average * 10) / 10 : 0,
    genres: detail?.genres?.map((genre) => genre.name).slice(0, 2).join(", ") || "",
    mediaType: "movie",
  }
}
async function lookupEpisodeTMDB(seriesId, episodeNumber) {
  const data = await tmdbFetch(`/tv/${seriesId}/season/1/episode/${episodeNumber}?language=es-MX`)
  if (!data) return null
  return {
    title: (data.name || "").trim(),
    overview: (data.overview || "").trim(),
  }
}
function detectTracks(filePath) {
  try {
    const result = JSON.parse(
      execSync(
        `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath}"`,
        { encoding: "utf-8", timeout: 30000 }
      )
    )
    const audioTracks = []
    const subTracks = []
    for (const s of result.streams || []) {
      if (s.codec_type === "audio") {
        audioTracks.push({
          index: s.index,
          language: s.tags?.language || "und",
          codec: s.codec_name,
          title: s.tags?.title || "",
        })
      } else if (s.codec_type === "subtitle") {
        subTracks.push({
          index: s.index,
          language: s.tags?.language || "und",
          codec: s.codec_name,
          title: s.tags?.title || "",
        })
      }
    }
    const durationSeconds = Number(result.format?.duration) || 0
    return { audioTracks, subTracks, durationSeconds }
  } catch {
    return { audioTracks: [], subTracks: [], durationSeconds: 0 }
  }
}

function parseEpisodeNumber(name) {
  const m = name.match(/E(\d+)/i)
  return m ? parseInt(m[1], 10) : 0
}

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"])
const SUBTITLE_EXTS = new Set([".srt", ".vtt", ".ass", ".ssa", ".sub"])

const QUALITY_PATTERNS = [
  [/4K|2160p/i, "4K"],
  [/1080p|FHD/i, "1080p"],
  [/720p|HD/i, "720p"],
  [/480p|SD/i, "480p"],
]

const LANG_MAP = {
  spa: "Español", spanish: "Español", es: "Español",
  eng: "Inglés", english: "Inglés", en: "Inglés",
  jpn: "Japonés", japanese: "Japonés", ja: "Japonés",
  fre: "Francés", french: "Francés", fr: "Francés",
  kor: "Coreano", korean: "Coreano", ko: "Coreano",
  ger: "Alemán", german: "Alemán", de: "Alemán",
  ita: "Italiano", italian: "Italiano", it: "Italiano",
  por: "Portugués", portuguese: "Portugués", pt: "Portugués",
  chi: "Chino", chinese: "Chino", zh: "Chino",
  rus: "Ruso", russian: "Ruso", ru: "Ruso",
  ara: "Árabe", arabic: "Árabe", ar: "Árabe",
}

function detectLang(str) {
  const lower = str.toLowerCase()
  for (const [key, lang] of Object.entries(LANG_MAP)) {
    const re = new RegExp(`[.\\s-_]${key}[.\\s-_]`, "i")
    if (re.test(`.${lower}.`)) return lang
  }
  return null
}

function parseFileName(fileName) {
  const ext = extname(fileName).toLowerCase()
  if (!VIDEO_EXTS.has(ext)) return null

  const name = fileName.slice(0, fileName.lastIndexOf("."))

  // Extract year
  let year = 0
  let titlePart = name
  const parenMatch = name.match(/\((\d{4})\)\s*$/)
  if (parenMatch) {
    year = parseInt(parenMatch[1])
    titlePart = name.slice(0, parenMatch.index).trim()
  } else {
    const dotMatch = name.match(/[.\s](\d{4})$/)
    if (dotMatch) {
      year = parseInt(dotMatch[1])
      titlePart = name.slice(0, name.lastIndexOf(dotMatch[1]) - 1).trim()
    }
  }
  if (!year) year = new Date().getFullYear()

  // Extract quality
  let quality = "1080p"
  for (const [re, q] of QUALITY_PATTERNS) {
    if (re.test(name)) { quality = q; break }
  }

  // Clean title
  let clean = titlePart
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  for (const [re] of QUALITY_PATTERNS) {
    clean = clean.replace(re, "")
  }
  clean = clean
    .replace(/WEB[-.]?DL|BluRay|HDTV|BRRip|DVDRip|x264|x265|HEVC|HDR|Dolby[\s-]Atmos/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  return {
    title: clean || name.replace(/[._]/g, " ").trim(),
    year,
    quality,
    videoFile: fileName,
  }
}

function findSubs(videoFile, allFiles) {
  const base = videoFile.slice(0, videoFile.lastIndexOf("."))
  const subs = []

  for (const f of allFiles) {
    const fext = extname(f).toLowerCase()
    if (!SUBTITLE_EXTS.has(fext)) continue

    const fbase = f.slice(0, f.lastIndexOf("."))
    if (fbase.startsWith(base)) {
      const suffix = fbase.slice(base.length).replace(/^[.\s-_]+/, "")
      let lang = "Español"
      if (suffix) {
        const detected = detectLang(suffix)
        if (detected) lang = detected
      }
      subs.push({ lang, file: f })
    }
  }
  return subs
}

function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return "Duración desconocida"
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
function formatSize(bytes) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`
  return `${(bytes / 1_000).toFixed(0)} KB`
}

if (!existsSync(MOVIE_DIR)) {
  console.error(`Directory not found: ${MOVIE_DIR}`)
  process.exit(1)
}

const allEntries = readdirSync(MOVIE_DIR, { withFileTypes: true })
const movies = []

const CATEGORY_DIR_TYPES = new Map([
  ["anime", "anime"],
  ["animes", "anime"],
  ["serie", "series"],
  ["series", "series"],
])

function categoryTypeFromFolder(folderName) {
  return CATEGORY_DIR_TYPES.get(folderName.trim().toLowerCase()) || null
}

async function processVideoFile(fullPath, fileName, seriesInfo, siblingFiles) {
  try {
    const stats = statSync(fullPath)
    const subtitleFolder = seriesInfo?.folder || ""
    const subs = findSubs(fileName, siblingFiles).map((subtitle) => ({
      ...subtitle,
      file: subtitleFolder ? join(subtitleFolder, subtitle.file) : subtitle.file,
    }))
    const subLangs = [...new Set(subs.map((subtitle) => subtitle.lang))]

    const tracks = detectTracks(fullPath)
    const embeddedAudio = tracks.audioTracks
    const embeddedSubs = tracks.subTracks
    const detectedLangs = [...new Set([
      ...embeddedAudio.map((track) => track.language),
      ...subLangs,
    ])]
    const videoLangs = detectedLangs.length > 0 ? detectedLangs : ["Español"]

    if (seriesInfo) {
      const epNum = parseEpisodeNumber(fileName)
      const nameWithoutExt = fileName.slice(0, fileName.lastIndexOf("."))
      const fileEpisodeTitle = nameWithoutExt
        .replace(/(?:S\d+)?E\d+\s*-?\s*/i, "")
        .replace(/[._]/g, " ")
        .trim()
      const tmdb = seriesInfo.tmdb
      const episodeData = tmdb?.mediaType === "tv" && epNum > 0
        ? await lookupEpisodeTMDB(tmdb.tmdbId, epNum)
        : null
      const episodeTitle = episodeData?.title || fileEpisodeTitle || `Episodio ${epNum}`
      const episodeSynopsis = episodeData?.overview || ""
      const epFallback = `Episodio ${epNum} de ${seriesInfo.title}.${tmdb?.genres ? ` Género: ${tmdb.genres}.` : ""}`

      movies.push({
        id: `local-${movies.length}`,
        tmdbId: tmdb?.tmdbId ?? 0,
        title: episodeTitle,
        year: seriesInfo.year,
        quality: "1080p",
        rating: tmdb?.rating ?? 0,
        genre: tmdb?.genres || (seriesInfo.type === "anime" ? "Animación" : "Series"),
        description: episodeSynopsis || `Episodio ${epNum}: ${episodeTitle}`,
        longDescription: episodeSynopsis || epFallback,
        episodeSynopsis: episodeSynopsis || undefined,
        posterPath: tmdb?.posterPath ?? null,
        backdropPath: tmdb?.backdropPath ?? null,
        type: seriesInfo.type,
        duration: formatDuration(tracks.durationSeconds),
        durationSeconds: tracks.durationSeconds,
        language: videoLangs,
        subtitles: [...new Set([
          ...embeddedSubs.map((track) => track.language),
          ...subLangs,
        ])],
        contentRating: "",
        videoFile: join(seriesInfo.folder, fileName),
        subFiles: subs,
        fileSize: stats.size,
        embeddedAudio,
        embeddedSubs,
        seriesTitle: seriesInfo.title,
        episodeNumber: epNum,
        totalEpisodes: seriesInfo.totalEpisodes,
        seasonNumber: seriesInfo.seasonNumber || 1,
      })

      const metadataStatus = tmdb ? "✓ TMDB" : "✗ sin datos"
      console.log(`  [${movies.length}] ${seriesInfo.title} E${epNum} → ${metadataStatus}`)
    } else {
      const parsed = parseFileName(fileName)
      if (!parsed) return

      const tmdb = await lookupMovieTMDB(parsed.title, parsed.year)
      const officialTitle = tmdb?.title || parsed.title
      const fileSizeStr = formatSize(stats.size)
      const fallbackDesc = `${officialTitle} (${parsed.year}).${tmdb?.genres ? ` Género: ${tmdb.genres}.` : ""} Calidad ${parsed.quality}.`
      movies.push({
        id: `local-${movies.length}`,
        tmdbId: tmdb?.tmdbId ?? 0,
        title: officialTitle,
        year: parsed.year,
        quality: parsed.quality,
        rating: tmdb?.rating ?? 0,
        genre: tmdb?.genres ?? "",
        description: tmdb?.overview || `${officialTitle} (${parsed.year}) — ${fileSizeStr}`,
        longDescription: tmdb?.overview || fallbackDesc,
        posterPath: tmdb?.posterPath ?? null,
        backdropPath: tmdb?.backdropPath ?? null,
        type: "movie",
        duration: formatDuration(tracks.durationSeconds),
        durationSeconds: tracks.durationSeconds,
        language: videoLangs,
        subtitles: [...new Set([
          ...embeddedSubs.map((track) => track.language),
          ...subLangs,
        ])],
        contentRating: "",
        videoFile: fileName,
        subFiles: subs,
        fileSize: stats.size,
        embeddedAudio,
        embeddedSubs,
      })

      const metadataStatus = tmdb ? "✓ TMDB" : "✗ sin datos"
      console.log(`  [${movies.length}] ${officialTitle} (${parsed.year}) → ${metadataStatus}`)
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300))
  } catch (error) {
    console.error(`Error processing ${fileName}:`, error.message)
  }
}

const SEASON_FOLDER_RE = /^temporada\s*(\d+)/i

async function processSeriesFolder(folderPath, folderRelative, folderName, type) {
  const entries = readdirSync(folderPath, { withFileTypes: true })
  const dirs = entries.filter((entry) => entry.isDirectory())
  const seasonDirs = dirs
    .map((d) => ({ name: d.name, num: extractSeasonNumber(d.name) }))
    .filter((d) => d.num > 0)
    .sort((a, b) => a.num - b.num)

  const parsedSeries = parseFileName(folderName + ".mkv")
  const seriesTitle = parsedSeries?.title || folderName
  const seriesYear = parsedSeries?.year || new Date().getFullYear()
  const tmdb = await lookupSeriesTMDB(seriesTitle)

  if (seasonDirs.length > 0) {
    // Multi-season structure
    console.log(`\n📁 ${type === "anime" ? "Anime" : "Serie"}: ${seriesTitle} (${seriesYear}) — ${seasonDirs.length} temporada(s)`)

    const allSeasons = []
    let seasonEpCount = 0

    for (const season of seasonDirs) {
      const seasonPath = join(folderPath, season.name)
      const seasonRelative = join(folderRelative, season.name)
      const files = readdirSync(seasonPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
      const episodeFiles = files
        .filter((fileName) => VIDEO_EXTS.has(extname(fileName).toLowerCase()))
        .sort((a, b) => parseEpisodeNumber(a) - parseEpisodeNumber(b) || a.localeCompare(b))

      if (episodeFiles.length === 0) continue

      const seasonEpisodes = []
      for (const fileName of episodeFiles) {
        await processVideoFile(join(seasonPath, fileName), fileName, {
          title: seriesTitle,
          year: seriesYear,
          folder: seasonRelative,
          totalEpisodes: 0,
          seasonNumber: season.num,
          type,
          tmdb,
        }, files)
        seasonEpisodes.push(movies.length)
        seasonEpCount++
      }
      allSeasons.push({ season: season.num, episodes: seasonEpisodes })
    }

    // Update totalEpisodes for each episode of this series
    for (const movie of movies) {
      if (movie.seriesTitle === seriesTitle && movie.type === type) {
        movie.totalEpisodes = seasonEpCount
      }
    }
  } else {
    // Single season (no Temporada folders)
    const siblingFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    const episodeFiles = siblingFiles
      .filter((fileName) => VIDEO_EXTS.has(extname(fileName).toLowerCase()))
      .sort((a, b) => parseEpisodeNumber(a) - parseEpisodeNumber(b) || a.localeCompare(b))

    if (episodeFiles.length === 0) return

    console.log(`\n📁 ${type === "anime" ? "Anime" : "Serie"}: ${seriesTitle} (${seriesYear}) — ${episodeFiles.length} episodios`)

    for (const fileName of episodeFiles) {
      await processVideoFile(join(folderPath, fileName), fileName, {
        title: seriesTitle,
        year: seriesYear,
        folder: folderRelative,
        totalEpisodes: episodeFiles.length,
        seasonNumber: 1,
        type,
        tmdb,
      }, siblingFiles)
    }
  }
}

function extractSeasonNumber(folderName) {
  const match = folderName.match(SEASON_FOLDER_RE)
  return match ? parseInt(match[1], 10) : 0
}

// Preferred structure:
// F:\Peliculas\animes\Nombre del anime\episodios.mkv
// F:\Peliculas\series\Nombre de la serie\episodios.mkv
const categoryDirectories = allEntries.filter(
  (entry) => entry.isDirectory() && categoryTypeFromFolder(entry.name)
)

for (const categoryDirectory of categoryDirectories) {
  const categoryType = categoryTypeFromFolder(categoryDirectory.name)
  const categoryPath = join(MOVIE_DIR, categoryDirectory.name)
  const titleDirectories = readdirSync(categoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  for (const titleDirectory of titleDirectories) {
    await processSeriesFolder(
      join(categoryPath, titleDirectory.name),
      join(categoryDirectory.name, titleDirectory.name),
      titleDirectory.name,
      categoryType
    )
  }
}

// Backward compatibility: a title folder directly under F:\Peliculas.
const legacyTitleDirectories = allEntries.filter(
  (entry) => entry.isDirectory() && !categoryTypeFromFolder(entry.name)
)

for (const directory of legacyTitleDirectories) {
  const directoryPath = join(MOVIE_DIR, directory.name)
  const tmdb = await lookupSeriesTMDB(directory.name)
  const inferredType = tmdb?.genres?.includes("Animación") ? "anime" : "series"
  await processSeriesFolder(directoryPath, directory.name, directory.name, inferredType)
}

// Root-level video files remain standalone movies.
const rootFiles = allEntries.filter((entry) => entry.isFile()).map((entry) => entry.name)
const videoFiles = rootFiles.filter((fileName) => VIDEO_EXTS.has(extname(fileName).toLowerCase()))

console.log(`\n🎬 ${videoFiles.length} películas`)

for (const fileName of videoFiles) {
  await processVideoFile(join(MOVIE_DIR, fileName), fileName, null, rootFiles)
}

movies.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))

writeFileSync(OUT_FILE, JSON.stringify(movies, null, 2), "utf-8")
console.log(`\n✅ Scanned ${movies.length} items → public/movies.json`)