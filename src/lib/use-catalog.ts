// Picks the catalog data source automatically: the local media library while
// running `npm run dev` (import.meta.env.DEV), TMDB everywhere else (production
// builds, including the Vercel deployment). import.meta.env.DEV is inlined by Vite
// at build time, so production bundles never execute the local-catalog code path.
import { useTMDB } from "@/lib/use-tmdb"
import { useLocalCatalog } from "@/lib/use-local-catalog"
import type { TMDbState } from "@/lib/use-tmdb"

export function useCatalog(): TMDbState {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useLocalCatalog()
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useTMDB()
}
