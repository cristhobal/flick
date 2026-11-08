import type { Category, Movie } from "@/lib/data"
import { translateGenre, type Lang } from "@/i18n/translations"

// The per-genre movie rows under the main home rows. Shared by HomePage (which draws
// them) and the TMDB loader (which fetches their details before the page appears, so
// none of their cards show up half-filled).
const HOME_GENRES = ["Horror", "Action", "Family", "Comedy", "Adventure", "Science Fiction"]
const HOME_ROW_SIZE = 20

export function buildHomeGenreCategories(movies: Movie[], lang: Lang): Category[] {
  return HOME_GENRES
    .map((genre) => {
      const title = translateGenre(genre, lang)
      const wanted = title.toLowerCase()
      const items = movies.filter((movie) =>
        movie.genre
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .includes(wanted)
      )
      return { title, items: items.slice(0, HOME_ROW_SIZE) }
    })
    .filter((category) => category.items.length > 0)
}
