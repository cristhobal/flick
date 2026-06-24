export interface EmbeddedTrack {
  index: number
  language: string
  codec: string
  title: string
}

export interface Movie {
  id: string
  tmdbId: number
  title: string
  year: number
  duration: string
  durationSeconds?: number
  quality: string
  rating: number
  genre: string
  language: string[]
  subtitles: string[]
  description: string
  longDescription: string
  type: "movie" | "series" | "anime"
  director?: string
  contentRating: string
  seasons?: number
  episodes?: number
  posterPath: string | null
  backdropPath: string | null
  // Local file fields
  videoFile?: string
  subFiles?: SubtitleFile[]
  fileSize?: number
  embeddedAudio?: EmbeddedTrack[]
  embeddedSubs?: EmbeddedTrack[]
  seriesTitle?: string
  episodeNumber?: number
  seasonNumber?: number
  totalEpisodes?: number
  seasonTitle?: string
  episodeTitle?: string
  episodeSynopsis?: string
  seriesEpisodes?: Movie[]
  seasonList?: { season: number; title?: string; episodes: Movie[] }[]
  totalSeasons?: number
  trailerUrl?: string
}

export interface SubtitleFile {
  lang: string
  file: string
}

export function getPlayableMovie(movie: Movie): Movie | null {
  if (movie.videoFile || movie.trailerUrl) return movie

  return (
    movie.seriesEpisodes?.find(
      (episode) => Boolean(episode.videoFile || episode.trailerUrl)
    ) || null
  )
}

export function isPlayableMovie(movie: Movie): boolean {
  return getPlayableMovie(movie) !== null
}

const genres = [
  "Acción", "Terror", "Comedia", "Drama", "Ciencia Ficción",
  "Suspenso", "Aventura", "Fantasía", "Documental", "Crimen",
]

const qualities = ["4K", "1080p", "720p", "4K HDR", "1080p HDR"]

const languages = ["Español", "Inglés", "Japonés", "Francés", "Coreano"]

const generateMovie = (id: string, type: Movie["type"] = "movie"): Movie => {
  const titles: Record<string, string[]> = {
    movie: [
      "The Shadow Protocol", "Midnight Echo", "Crimson Tide Rising",
      "The Last Horizon", "Neon Dreams", "Dark Matter",
      "Echoes of Silence", "The Iron Veil", "Frozen Path",
      "Storm Chaser", "The Whisper Network", "Burning Daylight",
    ],
    series: [
      "Chronicles of Power", "The Dark Heritage", "City of Lies",
      "Bloodline", "The Forgotten Kingdom", "Nightfall",
      "Empire of Shadows", "The Silent War", "Crossroads",
      "Legacy of Honor", "The Watchers", "Divided We Fall",
    ],
    anime: [
      "Spirit Blade", "Celestial Dawn", "Thunder Soul",
      "Phantom Realm", "Eternal Garden", "Rising Dragon",
      "Starfall Academy", "Shadow Walker", "Crystal Hearts",
      "Blade of Destiny", "Neon Genesis", "Samurai Ghost",
    ],
  }

  const descriptions = [
    "En un mundo donde el peligro acecha en cada esquina, un héroe improbable debe levantarse para enfrentar la oscuridad que amenaza con consumirlo todo.",
    "Una historia fascinante de redención y coraje en los momentos más oscuros. Cuando todo parece perdido, la esperanza encuentra su camino.",
    "Dos mundos chocan en esta épica aventura llena de giros inesperados. El destino de millones depende de una decisión imposible.",
    "En las profundidades del misterio, la verdad espera ser descubierta. Nada es lo que parece en este viaje al corazón de la incertidumbre.",
    "Una experiencia cinematográfica que desafía los límites de la imaginación. Prepárate para un viaje inolvidable.",
  ]

  const longDescriptions = [
    "En un mundo sumido en la oscuridad, donde las sombras esconden secretos milenarios, un héroe improbable debe encontrar la fuerza para enfrentar su destino. Acompañado por aliados inesperados, cada paso lo acerca más a la verdad que podría cambiarlo todo. Una historia de sacrificio, amistad y la lucha eterna entre la luz y la oscuridad.",
    "Cuando las líneas entre el bien y el mal se difuminan, la verdadera naturaleza del heroísmo es puesta a prueba. En esta apasionante historia, los personajes se enfrentan a decisiones imposibles que determinarán el futuro de su mundo. Con giros argumentales que mantendrán al espectador al borde de su asiento, esta producción marca un antes y un después en el género.",
    "Tres décadas después de los eventos que cambiaron el mundo, una nueva amenaza emerge de las cenizas del pasado. Viejos héroes y nuevas generaciones deben unir fuerzas para enfrentar un enemigo que conoce todos sus movimientos. Una epopeya que abarca generaciones y explora el verdadero significado del legado y la redención.",
  ]

  const title =
    titles[type][Math.floor(Math.random() * titles[type].length)]
  const genre = genres[Math.floor(Math.random() * genres.length)]
  const quality = qualities[Math.floor(Math.random() * qualities.length)]
  const contentRatings = ["+7", "+13", "+14", "+16", "+18", "R", "PG-13", "TV-MA", "TV-14"]
  const contentRating = contentRatings[Math.floor(Math.random() * contentRatings.length)]
  const langCount = 1 + Math.floor(Math.random() * 3)
  const selectedLangs = [...languages]
    .sort(() => Math.random() - 0.5)
    .slice(0, langCount)
  const subCount = 1 + Math.floor(Math.random() * 2)
  const selectedSubs = [...languages]
    .sort(() => Math.random() - 0.5)
    .slice(0, subCount)

  return {
    id,
    tmdbId: 0,
    title,
    year: 2018 + Math.floor(Math.random() * 8),
    duration: `${1 + Math.floor(Math.random() * 2)}h ${10 + Math.floor(Math.random() * 50)}m`,
    quality,
    rating: Math.round((6 + Math.random() * 4) * 10) / 10,
    contentRating,
    genre,
    language: selectedLangs,
    subtitles: selectedSubs,
    description: descriptions[Math.floor(Math.random() * descriptions.length)],
    longDescription:
      longDescriptions[Math.floor(Math.random() * longDescriptions.length)],
    type,
    posterPath: null,
    backdropPath: null,
    ...(type === "series" && {
      seasons: 1 + Math.floor(Math.random() * 6),
      episodes: 8 + Math.floor(Math.random() * 16),
    }),
    ...(type === "anime" && {
      seasons: 1 + Math.floor(Math.random() * 4),
      episodes: 12 + Math.floor(Math.random() * 14),
    }),
  }
}

const generateMovies = (count: number, type: Movie["type"] = "movie"): Movie[] =>
  Array.from({ length: count }, (_, i) =>
    generateMovie(`${type}-${i + 1}`, type)
  )

export const heroMovie: Movie = {
  id: "hero-1",
  tmdbId: 0,
  title: "The Shadow Protocol",
  year: 2025,
  duration: "2h 18m",
  quality: "4K HDR",
  rating: 9.2,
  contentRating: "+14",
  genre: "Acción",
  language: ["Español", "Inglés", "Francés"],
  subtitles: ["Español", "Inglés"],
  description:
    "En un mundo donde el peligro acecha en cada esquina, un héroe improbable debe levantarse para enfrentar la oscuridad que amenaza con consumirlo todo.",
  longDescription:
    "En un mundo sumido en la oscuridad, donde las sombras esconden secretos milenarios, un héroe improbable debe encontrar la fuerza para enfrentar su destino. Acompañado por aliados inesperados, cada paso lo acerca más a la verdad que podría cambiarlo todo. Una historia de sacrificio, amistad y la lucha eterna entre la luz y la oscuridad.",
  type: "movie",
  posterPath: null,
  backdropPath: null,
}

export interface Category {
  title: string
  items: Movie[]
}

export const categories: Category[] = [
  {
    title: "Continuar viendo",
    items: generateMovies(8),
  },
  {
    title: "Películas destacadas",
    items: generateMovies(10, "movie"),
  },
  {
    title: "Agregadas recientemente",
    items: generateMovies(8),
  },
  {
    title: "Anime",
    items: generateMovies(8, "anime"),
  },
  {
    title: "Series",
    items: generateMovies(8, "series"),
  },
  {
    title: "Acción",
    items: generateMovies(8, "movie"),
  },
  {
    title: "Terror",
    items: generateMovies(6, "movie"),
  },
  {
    title: "Comedia",
    items: generateMovies(6, "movie"),
  },
  {
    title: "Favoritos",
    items: [],
  },
]

export const allMovies: Movie[] = [
  ...categories.flatMap((c) => c.items),
  ...generateMovies(12, "movie"),
  ...generateMovies(8, "series"),
  ...generateMovies(8, "anime"),
]

export const genreOptions = genres
export const qualityOptions = qualities
export const languageOptions = languages
export const typeOptions = [
  { value: "movie" as const, label: "Películas" },
  { value: "series" as const, label: "Series" },
  { value: "anime" as const, label: "Anime" },
]

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342"): string | null {
  if (!path) return null
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export function backdropUrl(path: string | null, size: "w780" | "w1280" | "original" = "w1280"): string | null {
  if (!path) return null
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export function getGenreGradient(genre: string): string {
  const gradients: Record<string, string> = {
    Acción: "from-neutral-700 to-neutral-950",
    Terror: "from-neutral-800 to-black",
    Comedia: "from-neutral-600 to-neutral-900",
    Drama: "from-neutral-700 to-neutral-950",
    "Ciencia Ficción": "from-neutral-600 to-neutral-950",
    Suspenso: "from-neutral-800 to-black",
    Aventura: "from-neutral-600 to-neutral-900",
    Fantasía: "from-neutral-700 to-neutral-900",
    Documental: "from-neutral-600 to-neutral-800",
    Crimen: "from-neutral-800 to-black",
  }
  return gradients[genre] ?? "from-neutral-700 to-neutral-950"
}
