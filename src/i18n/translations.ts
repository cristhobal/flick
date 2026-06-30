export type Lang = "en" | "es" | "fr" | "hi" | "zh"

export const TMDB_LOCALES: Record<Lang, string> = {
  en: "en-US",
  es: "es-MX",
  fr: "fr-FR",
  hi: "hi-IN",
  zh: "zh-CN",
}

export const INTL_LOCALES: Record<Lang, string> = {
  en: "en-US",
  es: "es-MX",
  fr: "fr-FR",
  hi: "hi-IN",
  zh: "zh-CN",
}

type Dictionary = Record<string, string>

const en: Dictionary = {
  "site.title": "Flick â€” Your personal streaming platform", "site.description": "Explore movies, series and anime from TMDB.",
  "nav.home": "Home", "nav.movies": "Movies", "nav.series": "Series", "nav.anime": "Anime",
  "nav.library": "Library", "nav.main": "Main navigation",
  "common.search": "Search", "common.searchContent": "Search movies, series, anime...", "common.searchShort": "Search...",
  "common.play": "Play", "common.details": "View details", "common.comingSoon": "Coming soon", "common.availableSoon": "Available soon", "common.viewAll": "View all",
  "common.noResults": "No results found", "common.noAvailable": "Not available", "common.all": "All",
  "common.movies": "Movies", "common.series": "Series", "common.anime": "Anime", "common.catalog": "Full catalog",
  "common.episodes": "episodes", "common.season": "Season", "common.seasons": "Seasons", "common.general": "General", "common.retry": "Retry",
  "common.loading": "Loading your catalog...", "common.titles": "titles", "common.of": "of",
  "home.featured": "Featured content", "home.recent": "Recently added", "home.continue": "Continue watching",
  "home.featuredMovies": "Featured movies", "home.action": "Action", "home.horror": "Horror", "home.comedy": "Comedy",
  "search.noTitle": "No results", "search.noDescription": "We couldn't find content for â€œ{query}â€. Try another search term or adjust the filters.",
  "search.exploreTitle": "Explore your library", "search.exploreDescription": "Search TMDB movies, series and anime, or browse by category.",
  "search.suggestions": "Search suggestions", "search.mostViewed": "Most viewed", "search.justAdded": "Just added",
  "search.topRated": "Top rated", "search.resultsFor": "{count} result{suffix} for â€œ{query}â€",
  "category.filter": "Filter {title}...", "category.categories": "Categories", "category.sort": "Sort",
  "category.recent": "Most recent", "category.rating": "Top rated", "category.alpha": "A-Z",
  "category.count": "{shown} of {total} titles",
  "library.title": "Catalog", "library.count": "{count} TMDB titles", "library.filter": "Filter library...", "library.everything": "All",
  "filters.title": "Filters", "filters.clear": "Clear all", "filters.description": "Filters and sorting",
  "filters.sortBy": "Sort by", "filters.type": "Type", "filters.genre": "Genre", "filters.quality": "Quality",
  "filters.recent": "Most recent", "filters.rating": "Top rated", "filters.duration": "Duration",
  "details.label": "Details for {title}", "details.synopsis": "Synopsis", "details.subtitlesAvailable": "Available subtitles",
  "details.episodes": "Episodes", "details.cast": "Cast", "details.related": "Related", "details.similarAnime": "Similar anime",
  "details.similarSeries": "Similar series", "details.seasonsEpisodes": "{seasons} seasons Â· {episodes} episodes",
  "details.directors": "Directors", "details.direction": "Direction", "details.creators": "Creators",
  "details.studios": "Studios", "details.animationStudios": "Animation studios",
  "player.trailer": "Trailer", "player.audio": "Audio", "player.subtitles": "Subtitles", "player.off": "Off",
  "player.singleAudio": "Only one audio track is available", "player.episode": "Episode {episode}",
  "player.episodeOf": "Episode {episode} of {total}", "player.episodeNavigation": "Episode navigation",
  "player.previous": "Previous episode", "player.next": "Next episode", "player.related": "Related",
  "player.prepareError": "The video or audio could not be prepared for this browser.",
  "player.hlsError": "This browser could not open the HLS stream.",
  "player.hlsFallback": "This browser does not support HLS; the original file was attempted.",
  "tmdb.loadError": "Unable to load TMDB data", "movie.unknown": "Unknown title", "movie.fallback": "A compelling story available in your Flick catalog.",
  "language.label": "Language", "language.change": "Change language",
  "genre.action": "Action", "genre.horror": "Horror", "genre.comedy": "Comedy", "genre.drama": "Drama",
  "genre.scifi": "Science Fiction", "genre.thriller": "Thriller", "genre.adventure": "Adventure",
  "genre.fantasy": "Fantasy", "genre.documentary": "Documentary", "genre.crime": "Crime",
  "genre.animation": "Animation", "genre.family": "Family", "genre.mystery": "Mystery", "genre.romance": "Romance",
  "genre.history": "History", "genre.music": "Music", "genre.war": "War", "genre.western": "Western",
  "genre.reality": "Reality", "genre.soap": "Soap", "genre.talk": "Talk", "genre.news": "News",
  "genre.kids": "Kids", "genre.politics": "War & Politics",
}

const es: Dictionary = {
  "site.title": "Flick — Tu plataforma personal de streaming", "site.description": "Explora películas, series y anime desde TMDB.",
  "nav.home": "Inicio", "nav.movies": "Películas", "nav.series": "Series", "nav.anime": "Anime",
  "nav.library": "Catálogo", "nav.main": "Navegación principal",
  "common.search": "Buscar", "common.searchContent": "Buscar películas, series, anime...", "common.searchShort": "Buscar...",
  "common.play": "Reproducir", "common.details": "Ver detalles", "common.comingSoon": "Próximamente", "common.availableSoon": "Disponible próximamente", "common.viewAll": "Ver todo",
  "common.noResults": "No se encontraron resultados", "common.noAvailable": "No disponible", "common.all": "Todas",
  "common.movies": "Películas", "common.series": "Series", "common.anime": "Anime", "common.catalog": "Todo el catálogo",
  "common.episodes": "episodios", "common.season": "Temporada", "common.seasons": "Temporadas", "common.general": "General", "common.retry": "Reintentar",
  "common.loading": "Cargando tu catálogo...", "common.titles": "títulos", "common.of": "de",
  "home.featured": "Contenido destacado", "home.recent": "Agregadas recientemente", "home.continue": "Continuar viendo",
  "home.featuredMovies": "Películas destacadas", "home.action": "Acción", "home.horror": "Terror", "home.comedy": "Comedia",
  "search.noTitle": "Sin resultados", "search.noDescription": "No encontramos contenido para “{query}”. Intenta con otro término o ajusta los filtros.",
  "search.exploreTitle": "Explora el catálogo", "search.exploreDescription": "Busca películas, series y anime de TMDB, o explora por categorías.",
  "search.suggestions": "Sugerencias de búsqueda", "search.mostViewed": "Más vistos", "search.justAdded": "Recién agregados",
  "search.topRated": "Mejor valorados", "search.resultsFor": "{count} resultado{suffix} para “{query}”",
  "category.filter": "Filtrar {title}...", "category.categories": "Categorías", "category.sort": "Ordenar",
  "category.recent": "Más recientes", "category.rating": "Mejor valorados", "category.alpha": "A-Z",
  "category.count": "{shown} de {total} títulos",
  "library.title": "Catálogo", "library.count": "{count} títulos de TMDB", "library.filter": "Filtrar catálogo...", "library.everything": "Todo",
  "filters.title": "Filtros", "filters.clear": "Limpiar todo", "filters.description": "Filtros y ordenamiento",
  "filters.sortBy": "Ordenar por", "filters.type": "Tipo", "filters.genre": "Género", "filters.quality": "Calidad",
  "filters.recent": "Más reciente", "filters.rating": "Mejor valorado", "filters.duration": "Duración",
  "details.label": "Detalles de {title}", "details.synopsis": "Sinopsis", "details.subtitlesAvailable": "Subtítulos disponibles",
  "details.episodes": "Episodios", "details.cast": "Reparto", "details.related": "Relacionados", "details.similarAnime": "Animes similares",
  "details.similarSeries": "Series similares", "details.seasonsEpisodes": "{seasons} temporadas · {episodes} episodios",
  "details.directors": "Directores", "details.direction": "Dirección", "details.creators": "Creadores",
  "details.studios": "Estudios", "details.animationStudios": "Estudios de animación",
  "player.trailer": "Tráiler", "player.audio": "Audio", "player.subtitles": "Subtítulos", "player.off": "Desactivados",
  "player.singleAudio": "Solo hay una pista de audio", "player.episode": "Episodio {episode}",
  "player.episodeOf": "Episodio {episode} de {total}", "player.episodeNavigation": "Navegación de episodios",
  "player.previous": "Capítulo anterior", "player.next": "Capítulo siguiente", "player.related": "Relacionados",
  "player.prepareError": "No se pudo preparar el video o el audio para el navegador.",
  "player.hlsError": "Este navegador no pudo abrir la transmisión HLS.",
  "player.hlsFallback": "El navegador no soporta HLS; se intentó reproducir el archivo original.",
  "tmdb.loadError": "No se pudieron cargar los datos de TMDB", "movie.unknown": "Título desconocido", "movie.fallback": "Una historia fascinante disponible en tu catálogo de Flick.",
  "language.label": "Idioma", "language.change": "Cambiar idioma",
  "genre.action": "Acción", "genre.horror": "Terror", "genre.comedy": "Comedia", "genre.drama": "Drama",
  "genre.scifi": "Ciencia ficción", "genre.thriller": "Suspenso", "genre.adventure": "Aventura",
  "genre.fantasy": "Fantasía", "genre.documentary": "Documental", "genre.crime": "Crimen",
  "genre.animation": "Animaci\u00f3n", "genre.family": "Familia", "genre.mystery": "Misterio", "genre.romance": "Romance",
  "genre.history": "Historia", "genre.music": "M\u00fasica", "genre.war": "B\u00e9lica", "genre.western": "Western",
  "genre.reality": "Reality", "genre.soap": "Telenovela", "genre.talk": "Entrevistas", "genre.news": "Noticias",
  "genre.kids": "Infantil", "genre.politics": "B\u00e9lica y pol\u00edtica",
}

const fr: Dictionary = {
  "site.title": "Flick â€” Votre plateforme de streaming personnelle", "site.description": "Explorez films, series et anime depuis TMDB.",
  "nav.home": "Accueil", "nav.movies": "Films", "nav.series": "SÃ©ries", "nav.anime": "Anime",
  "nav.library": "BibliothÃ¨que", "nav.main": "Navigation principale",
  "common.search": "Rechercher", "common.searchContent": "Rechercher des films, sÃ©ries, anime...", "common.searchShort": "Rechercher...",
  "common.play": "Lire", "common.details": "Voir les dÃ©tails", "common.comingSoon": "BientÃ´t", "common.availableSoon": "Disponible prochainement", "common.viewAll": "Tout voir",
  "common.noResults": "Aucun rÃ©sultat", "common.noAvailable": "Indisponible", "common.all": "Toutes",
  "common.movies": "Films", "common.series": "SÃ©ries", "common.anime": "Anime", "common.catalog": "Catalogue complet",
  "common.episodes": "Ã©pisodes", "common.season": "Saison", "common.seasons": "Saisons", "common.general": "GÃ©nÃ©ral", "common.retry": "RÃ©essayer",
  "common.loading": "Chargement du catalogue...", "common.titles": "titres", "common.of": "sur",
  "home.featured": "Contenu Ã  la une", "home.recent": "AjoutÃ©s rÃ©cemment", "home.continue": "Continuer Ã  regarder",
  "home.featuredMovies": "Films Ã  la une", "home.action": "Action", "home.horror": "Horreur", "home.comedy": "ComÃ©die",
  "search.noTitle": "Aucun rÃ©sultat", "search.noDescription": "Aucun contenu trouvÃ© pour Â« {query} Â». Essayez un autre terme ou modifiez les filtres.",
  "search.exploreTitle": "Explorez votre bibliothÃ¨que", "search.exploreDescription": "Recherchez des films, sÃ©ries et anime, ou parcourez les catÃ©gories.",
  "search.suggestions": "Suggestions de recherche", "search.mostViewed": "Les plus vus", "search.justAdded": "AjoutÃ©s rÃ©cemment",
  "search.topRated": "Les mieux notÃ©s", "search.resultsFor": "{count} rÃ©sultat{suffix} pour Â« {query} Â»",
  "category.filter": "Filtrer {title}...", "category.categories": "CatÃ©gories", "category.sort": "Trier",
  "category.recent": "Plus rÃ©cents", "category.rating": "Mieux notÃ©s", "category.alpha": "A-Z",
  "category.count": "{shown} sur {total} titres",
  "library.title": "BibliothÃ¨que", "library.count": "{count} titres dans votre bibliothÃ¨que", "library.filter": "Filtrer la bibliothÃ¨que...", "library.everything": "Tout",
  "filters.title": "Filtres", "filters.clear": "Tout effacer", "filters.description": "Filtres et tri",
  "filters.sortBy": "Trier par", "filters.type": "Type", "filters.genre": "Genre", "filters.quality": "QualitÃ©",
  "filters.recent": "Plus rÃ©cent", "filters.rating": "Mieux notÃ©", "filters.duration": "DurÃ©e",
  "details.label": "DÃ©tails de {title}", "details.synopsis": "Synopsis", "details.subtitlesAvailable": "Sous-titres disponibles",
  "details.episodes": "Ã‰pisodes", "details.cast": "Distribution", "details.related": "Similaires", "details.similarAnime": "Anime similaires",
  "details.similarSeries": "SÃ©ries similaires", "details.seasonsEpisodes": "{seasons} saisons Â· {episodes} Ã©pisodes",
  "details.directors": "RÃ©alisateurs", "details.direction": "RÃ©alisation", "details.creators": "CrÃ©ateurs",
  "details.studios": "Studios", "details.animationStudios": "Studios d'animation",
  "player.trailer": "Bande-annonce", "player.audio": "Audio", "player.subtitles": "Sous-titres", "player.off": "DÃ©sactivÃ©s",
  "player.singleAudio": "Une seule piste audio est disponible", "player.episode": "Ã‰pisode {episode}",
  "player.episodeOf": "Ã‰pisode {episode} sur {total}", "player.episodeNavigation": "Navigation des Ã©pisodes",
  "player.previous": "Ã‰pisode prÃ©cÃ©dent", "player.next": "Ã‰pisode suivant", "player.related": "Similaires",
  "player.prepareError": "Impossible de prÃ©parer la vidÃ©o ou l'audio pour ce navigateur.",
  "player.hlsError": "Ce navigateur n'a pas pu ouvrir le flux HLS.",
  "player.hlsFallback": "Ce navigateur ne prend pas en charge HLS ; le fichier original a Ã©tÃ© essayÃ©.",
  "tmdb.loadError": "Impossible de charger les donnÃ©es TMDB", "movie.unknown": "Titre inconnu", "movie.fallback": "Une histoire captivante disponible dans votre catalogue Flick.",
  "language.label": "Langue", "language.change": "Changer de langue",
  "genre.action": "Action", "genre.horror": "Horreur", "genre.comedy": "ComÃ©die", "genre.drama": "Drame",
  "genre.scifi": "Science-fiction", "genre.thriller": "Thriller", "genre.adventure": "Aventure",
  "genre.fantasy": "Fantastique", "genre.documentary": "Documentaire", "genre.crime": "Crime",
}

const hi: Dictionary = {
  "site.title": "Flick â€” à¤†à¤ªà¤•à¤¾ à¤¨à¤¿à¤œà¥€ à¤¸à¥à¤Ÿà¥à¤°à¥€à¤®à¤¿à¤‚à¤— à¤ªà¥à¤²à¥‡à¤Ÿà¤«à¤¼à¥‰à¤°à¥à¤®", "site.description": "TMDB à¤¯à¤¾ à¤…à¤ªà¤¨à¥€ à¤¸à¥à¤¥à¤¾à¤¨à¥€à¤¯ à¤®à¥€à¤¡à¤¿à¤¯à¤¾ à¤²à¤¾à¤‡à¤¬à¥à¤°à¥‡à¤°à¥€ à¤¸à¥‡ à¤«à¤¼à¤¿à¤²à¥à¤®à¥‡à¤‚, à¤¸à¥€à¤°à¥€à¤œà¤¼ à¤”à¤° à¤à¤¨à¤¿à¤®à¥‡ à¤–à¥‹à¤œà¥‡à¤‚à¥¤",
  "nav.home": "à¤¹à¥‹à¤®", "nav.movies": "à¤«à¤¼à¤¿à¤²à¥à¤®à¥‡à¤‚", "nav.series": "à¤¸à¥€à¤°à¥€à¤œà¤¼", "nav.anime": "à¤à¤¨à¤¿à¤®à¥‡",
  "nav.library": "à¤²à¤¾à¤‡à¤¬à¥à¤°à¥‡à¤°à¥€", "nav.main": "à¤®à¥à¤–à¥à¤¯ à¤¨à¥‡à¤µà¤¿à¤—à¥‡à¤¶à¤¨",
  "common.search": "à¤–à¥‹à¤œà¥‡à¤‚", "common.searchContent": "à¤«à¤¼à¤¿à¤²à¥à¤®à¥‡à¤‚, à¤¸à¥€à¤°à¥€à¤œà¤¼, à¤à¤¨à¤¿à¤®à¥‡ à¤–à¥‹à¤œà¥‡à¤‚...", "common.searchShort": "à¤–à¥‹à¤œà¥‡à¤‚...",
  "common.play": "à¤šà¤²à¤¾à¤à¤", "common.details": "à¤µà¤¿à¤µà¤°à¤£ à¤¦à¥‡à¤–à¥‡à¤‚", "common.comingSoon": "à¤œà¤²à¥à¤¦ à¤† à¤°à¤¹à¤¾ à¤¹à¥ˆ", "common.availableSoon": "à¤œà¤²à¥à¤¦ à¤‰à¤ªà¤²à¤¬à¥à¤§", "common.viewAll": "à¤¸à¤­à¥€ à¤¦à¥‡à¤–à¥‡à¤‚",
  "common.noResults": "à¤•à¥‹à¤ˆ à¤ªà¤°à¤¿à¤£à¤¾à¤® à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾", "common.noAvailable": "à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚", "common.all": "à¤¸à¤­à¥€",
  "common.movies": "à¤«à¤¼à¤¿à¤²à¥à¤®à¥‡à¤‚", "common.series": "à¤¸à¥€à¤°à¥€à¤œà¤¼", "common.anime": "à¤à¤¨à¤¿à¤®à¥‡", "common.catalog": "à¤ªà¥‚à¤°à¤¾ à¤•à¥ˆà¤Ÿà¤²à¥‰à¤—",
  "common.episodes": "à¤à¤ªà¤¿à¤¸à¥‹à¤¡", "common.season": "à¤¸à¥€à¤œà¤¼à¤¨", "common.seasons": "à¤¸à¥€à¤œà¤¼à¤¨", "common.general": "à¤¸à¤¾à¤®à¤¾à¤¨à¥à¤¯", "common.retry": "à¤«à¤¿à¤° à¤ªà¥à¤°à¤¯à¤¾à¤¸ à¤•à¤°à¥‡à¤‚",
  "common.loading": "à¤•à¥ˆà¤Ÿà¤²à¥‰à¤— à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...", "common.titles": "à¤¶à¥€à¤°à¥à¤·à¤•", "common.of": "à¤®à¥‡à¤‚ à¤¸à¥‡",
  "home.featured": "à¤µà¤¿à¤¶à¥‡à¤· à¤¸à¤¾à¤®à¤—à¥à¤°à¥€", "home.recent": "à¤¹à¤¾à¤² à¤¹à¥€ à¤®à¥‡à¤‚ à¤œà¥‹à¤¡à¤¼à¥‡ à¤—à¤", "home.continue": "à¤¦à¥‡à¤–à¤¨à¤¾ à¤œà¤¾à¤°à¥€ à¤°à¤–à¥‡à¤‚",
  "home.featuredMovies": "à¤µà¤¿à¤¶à¥‡à¤· à¤«à¤¼à¤¿à¤²à¥à¤®à¥‡à¤‚", "home.action": "à¤à¤•à¥à¤¶à¤¨", "home.horror": "à¤¹à¥‰à¤°à¤°", "home.comedy": "à¤•à¥‰à¤®à¥‡à¤¡à¥€",
  "search.noTitle": "à¤•à¥‹à¤ˆ à¤ªà¤°à¤¿à¤£à¤¾à¤® à¤¨à¤¹à¥€à¤‚", "search.noDescription": "â€œ{query}â€ à¤•à¥‡ à¤²à¤¿à¤ à¤¸à¤¾à¤®à¤—à¥à¤°à¥€ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€à¥¤ à¤¦à¥‚à¤¸à¤°à¤¾ à¤¶à¤¬à¥à¤¦ à¤¯à¤¾ à¤«à¤¼à¤¿à¤²à¥à¤Ÿà¤° à¤†à¤œà¤¼à¤®à¤¾à¤à¤à¥¤",
  "search.exploreTitle": "à¤…à¤ªà¤¨à¥€ à¤²à¤¾à¤‡à¤¬à¥à¤°à¥‡à¤°à¥€ à¤–à¥‹à¤œà¥‡à¤‚", "search.exploreDescription": "à¤«à¤¼à¤¿à¤²à¥à¤®à¥‡à¤‚, à¤¸à¥€à¤°à¥€à¤œà¤¼ à¤”à¤° à¤à¤¨à¤¿à¤®à¥‡ à¤–à¥‹à¤œà¥‡à¤‚ à¤¯à¤¾ à¤¶à¥à¤°à¥‡à¤£à¤¿à¤¯à¤¾à¤ à¤¦à¥‡à¤–à¥‡à¤‚à¥¤",
  "search.suggestions": "à¤–à¥‹à¤œ à¤¸à¥à¤à¤¾à¤µ", "search.mostViewed": "à¤¸à¤¬à¤¸à¥‡ à¤…à¤§à¤¿à¤• à¤¦à¥‡à¤–à¥‡ à¤—à¤", "search.justAdded": "à¤¹à¤¾à¤² à¤®à¥‡à¤‚ à¤œà¥‹à¤¡à¤¼à¥‡ à¤—à¤",
  "search.topRated": "à¤¶à¥€à¤°à¥à¤· à¤°à¥‡à¤Ÿà¥‡à¤¡", "search.resultsFor": "â€œ{query}â€ à¤•à¥‡ à¤²à¤¿à¤ {count} à¤ªà¤°à¤¿à¤£à¤¾à¤®",
  "category.filter": "{title} à¤«à¤¼à¤¿à¤²à¥à¤Ÿà¤° à¤•à¤°à¥‡à¤‚...", "category.categories": "à¤¶à¥à¤°à¥‡à¤£à¤¿à¤¯à¤¾à¤", "category.sort": "à¤•à¥à¤°à¤®",
  "category.recent": "à¤¨à¤µà¥€à¤¨à¤¤à¤®", "category.rating": "à¤¶à¥€à¤°à¥à¤· à¤°à¥‡à¤Ÿà¥‡à¤¡", "category.alpha": "A-Z",
  "category.count": "{total} à¤®à¥‡à¤‚ à¤¸à¥‡ {shown} à¤¶à¥€à¤°à¥à¤·à¤•",
  "library.title": "à¤²à¤¾à¤‡à¤¬à¥à¤°à¥‡à¤°à¥€", "library.count": "à¤†à¤ªà¤•à¥€ à¤²à¤¾à¤‡à¤¬à¥à¤°à¥‡à¤°à¥€ à¤®à¥‡à¤‚ {count} à¤¶à¥€à¤°à¥à¤·à¤•", "library.filter": "à¤²à¤¾à¤‡à¤¬à¥à¤°à¥‡à¤°à¥€ à¤«à¤¼à¤¿à¤²à¥à¤Ÿà¤° à¤•à¤°à¥‡à¤‚...", "library.everything": "à¤¸à¤­à¥€",
  "filters.title": "à¤«à¤¼à¤¿à¤²à¥à¤Ÿà¤°", "filters.clear": "à¤¸à¤­à¥€ à¤¸à¤¾à¤«à¤¼ à¤•à¤°à¥‡à¤‚", "filters.description": "à¤«à¤¼à¤¿à¤²à¥à¤Ÿà¤° à¤”à¤° à¤•à¥à¤°à¤®",
  "filters.sortBy": "à¤•à¥à¤°à¤®à¤¬à¤¦à¥à¤§ à¤•à¤°à¥‡à¤‚", "filters.type": "à¤ªà¥à¤°à¤•à¤¾à¤°", "filters.genre": "à¤¶à¥ˆà¤²à¥€", "filters.quality": "à¤—à¥à¤£à¤µà¤¤à¥à¤¤à¤¾",
  "filters.recent": "à¤¨à¤µà¥€à¤¨à¤¤à¤®", "filters.rating": "à¤¶à¥€à¤°à¥à¤· à¤°à¥‡à¤Ÿà¥‡à¤¡", "filters.duration": "à¤…à¤µà¤§à¤¿",
  "details.label": "{title} à¤•à¤¾ à¤µà¤¿à¤µà¤°à¤£", "details.synopsis": "à¤¸à¤¾à¤°à¤¾à¤‚à¤¶", "details.subtitlesAvailable": "à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤‰à¤ªà¤¶à¥€à¤°à¥à¤·à¤•",
  "details.episodes": "à¤à¤ªà¤¿à¤¸à¥‹à¤¡", "details.cast": "à¤•à¤²à¤¾à¤•à¤¾à¤°", "details.related": "à¤¸à¤‚à¤¬à¤‚à¤§à¤¿à¤¤", "details.similarAnime": "à¤¸à¤®à¤¾à¤¨ à¤à¤¨à¤¿à¤®à¥‡",
  "details.similarSeries": "à¤¸à¤®à¤¾à¤¨ à¤¸à¥€à¤°à¥€à¤œà¤¼", "details.seasonsEpisodes": "{seasons} à¤¸à¥€à¤œà¤¼à¤¨ Â· {episodes} à¤à¤ªà¤¿à¤¸à¥‹à¤¡",
  "details.directors": "Directors", "details.direction": "Direction", "details.creators": "Creators",
  "details.studios": "Studios", "details.animationStudios": "Animation studios",
  "player.trailer": "à¤Ÿà¥à¤°à¥‡à¤²à¤°", "player.audio": "à¤‘à¤¡à¤¿à¤¯à¥‹", "player.subtitles": "à¤‰à¤ªà¤¶à¥€à¤°à¥à¤·à¤•", "player.off": "à¤¬à¤‚à¤¦",
  "player.singleAudio": "à¤•à¥‡à¤µà¤² à¤à¤• à¤‘à¤¡à¤¿à¤¯à¥‹ à¤Ÿà¥à¤°à¥ˆà¤• à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¹à¥ˆ", "player.episode": "à¤à¤ªà¤¿à¤¸à¥‹à¤¡ {episode}",
  "player.episodeOf": "{total} à¤®à¥‡à¤‚ à¤¸à¥‡ à¤à¤ªà¤¿à¤¸à¥‹à¤¡ {episode}", "player.episodeNavigation": "à¤à¤ªà¤¿à¤¸à¥‹à¤¡ à¤¨à¥‡à¤µà¤¿à¤—à¥‡à¤¶à¤¨",
  "player.previous": "à¤ªà¤¿à¤›à¤²à¤¾ à¤à¤ªà¤¿à¤¸à¥‹à¤¡", "player.next": "à¤…à¤—à¤²à¤¾ à¤à¤ªà¤¿à¤¸à¥‹à¤¡", "player.related": "à¤¸à¤‚à¤¬à¤‚à¤§à¤¿à¤¤",
  "player.prepareError": "à¤‡à¤¸ à¤¬à¥à¤°à¤¾à¤‰à¤œà¤¼à¤° à¤•à¥‡ à¤²à¤¿à¤ à¤µà¥€à¤¡à¤¿à¤¯à¥‹ à¤¯à¤¾ à¤‘à¤¡à¤¿à¤¯à¥‹ à¤¤à¥ˆà¤¯à¤¾à¤° à¤¨à¤¹à¥€à¤‚ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾ à¤¸à¤•à¤¾à¥¤",
  "player.hlsError": "à¤¯à¤¹ à¤¬à¥à¤°à¤¾à¤‰à¤œà¤¼à¤° HLS à¤¸à¥à¤Ÿà¥à¤°à¥€à¤® à¤¨à¤¹à¥€à¤‚ à¤–à¥‹à¤² à¤¸à¤•à¤¾à¥¤",
  "player.hlsFallback": "à¤¯à¤¹ à¤¬à¥à¤°à¤¾à¤‰à¤œà¤¼à¤° HLS à¤•à¤¾ à¤¸à¤®à¤°à¥à¤¥à¤¨ à¤¨à¤¹à¥€à¤‚ à¤•à¤°à¤¤à¤¾; à¤®à¥‚à¤² à¤«à¤¼à¤¾à¤‡à¤² à¤†à¤œà¤¼à¤®à¤¾à¤ˆ à¤—à¤ˆà¥¤",
  "tmdb.loadError": "TMDB à¤¡à¥‡à¤Ÿà¤¾ à¤²à¥‹à¤¡ à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾", "movie.unknown": "à¤…à¤œà¥à¤žà¤¾à¤¤ à¤¶à¥€à¤°à¥à¤·à¤•", "movie.fallback": "à¤†à¤ªà¤•à¥‡ Flick à¤•à¥ˆà¤Ÿà¤²à¥‰à¤— à¤®à¥‡à¤‚ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤à¤• à¤°à¥‹à¤šà¤• à¤•à¤¹à¤¾à¤¨à¥€à¥¤",
  "language.label": "à¤­à¤¾à¤·à¤¾", "language.change": "à¤­à¤¾à¤·à¤¾ à¤¬à¤¦à¤²à¥‡à¤‚",
  "genre.action": "à¤à¤•à¥à¤¶à¤¨", "genre.horror": "à¤¹à¥‰à¤°à¤°", "genre.comedy": "à¤•à¥‰à¤®à¥‡à¤¡à¥€", "genre.drama": "à¤¡à¥à¤°à¤¾à¤®à¤¾",
  "genre.scifi": "à¤µà¤¿à¤œà¥à¤žà¤¾à¤¨ à¤•à¤¥à¤¾", "genre.thriller": "à¤¥à¥à¤°à¤¿à¤²à¤°", "genre.adventure": "à¤°à¥‹à¤®à¤¾à¤‚à¤š",
  "genre.fantasy": "à¤«à¥ˆà¤‚à¤Ÿà¥‡à¤¸à¥€", "genre.documentary": "à¤¡à¥‰à¤•à¥à¤¯à¥‚à¤®à¥‡à¤‚à¤Ÿà¥à¤°à¥€", "genre.crime": "à¤…à¤ªà¤°à¤¾à¤§",
}

const zh: Dictionary = {
  "site.title": "Flick â€” ä½ çš„ä¸ªäººæµåª’ä½“å¹³å°", "site.description": "æµè§ˆæ¥è‡ª TMDB æˆ–æœ¬åœ°åª’ä½“åº“çš„ç”µå½±ã€å‰§é›†å’ŒåŠ¨ç”»ã€‚",
  "nav.home": "é¦–é¡µ", "nav.movies": "ç”µå½±", "nav.series": "å‰§é›†", "nav.anime": "åŠ¨ç”»",
  "nav.library": "åª’ä½“åº“", "nav.main": "ä¸»å¯¼èˆª",
  "common.search": "æœç´¢", "common.searchContent": "æœç´¢ç”µå½±ã€å‰§é›†ã€åŠ¨ç”»...", "common.searchShort": "æœç´¢...",
  "common.play": "æ’­æ”¾", "common.details": "æŸ¥çœ‹è¯¦æƒ…", "common.comingSoon": "å³å°†æŽ¨å‡º", "common.availableSoon": "å³å°†å¯ç”¨", "common.viewAll": "æŸ¥çœ‹å…¨éƒ¨",
  "common.noResults": "æœªæ‰¾åˆ°ç»“æžœ", "common.noAvailable": "ä¸å¯ç”¨", "common.all": "å…¨éƒ¨",
  "common.movies": "ç”µå½±", "common.series": "å‰§é›†", "common.anime": "åŠ¨ç”»", "common.catalog": "å®Œæ•´ç›®å½•",
  "common.episodes": "é›†", "common.season": "å­£", "common.seasons": "å­£", "common.general": "ç»¼åˆ", "common.retry": "é‡è¯•",
  "common.loading": "æ­£åœ¨åŠ è½½ç›®å½•...", "common.titles": "ä¸ªæ ‡é¢˜", "common.of": "/",
  "home.featured": "ç²¾é€‰å†…å®¹", "home.recent": "æœ€è¿‘æ·»åŠ ", "home.continue": "ç»§ç»­è§‚çœ‹",
  "home.featuredMovies": "ç²¾é€‰ç”µå½±", "home.action": "åŠ¨ä½œ", "home.horror": "ææ€–", "home.comedy": "å–œå‰§",
  "search.noTitle": "æ²¡æœ‰ç»“æžœ", "search.noDescription": "æœªæ‰¾åˆ°â€œ{query}â€çš„å†…å®¹ï¼Œè¯·å°è¯•å…¶ä»–å…³é”®è¯æˆ–è°ƒæ•´ç­›é€‰æ¡ä»¶ã€‚",
  "search.exploreTitle": "æŽ¢ç´¢åª’ä½“åº“", "search.exploreDescription": "æœç´¢ç”µå½±ã€å‰§é›†å’ŒåŠ¨ç”»ï¼Œæˆ–æŒ‰åˆ†ç±»æµè§ˆã€‚",
  "search.suggestions": "æœç´¢å»ºè®®", "search.mostViewed": "æœ€å¤šè§‚çœ‹", "search.justAdded": "æœ€è¿‘æ·»åŠ ",
  "search.topRated": "æœ€é«˜è¯„åˆ†", "search.resultsFor": "â€œ{query}â€å…±æœ‰ {count} ä¸ªç»“æžœ",
  "category.filter": "ç­›é€‰{title}...", "category.categories": "åˆ†ç±»", "category.sort": "æŽ’åº",
  "category.recent": "æœ€æ–°", "category.rating": "æœ€é«˜è¯„åˆ†", "category.alpha": "A-Z",
  "category.count": "æ˜¾ç¤º {shown} / {total} ä¸ªæ ‡é¢˜",
  "library.title": "åª’ä½“åº“", "library.count": "åª’ä½“åº“ä¸­æœ‰ {count} ä¸ªæ ‡é¢˜", "library.filter": "ç­›é€‰åª’ä½“åº“...", "library.everything": "å…¨éƒ¨",
  "filters.title": "ç­›é€‰", "filters.clear": "å…¨éƒ¨æ¸…é™¤", "filters.description": "ç­›é€‰ä¸ŽæŽ’åº",
  "filters.sortBy": "æŽ’åºæ–¹å¼", "filters.type": "ç±»åž‹", "filters.genre": "é¢˜æ", "filters.quality": "ç”»è´¨",
  "filters.recent": "æœ€æ–°", "filters.rating": "æœ€é«˜è¯„åˆ†", "filters.duration": "æ—¶é•¿",
  "details.label": "{title}çš„è¯¦æƒ…", "details.synopsis": "ç®€ä»‹", "details.subtitlesAvailable": "å¯ç”¨å­—å¹•",
  "details.episodes": "å‰§é›†", "details.cast": "æ¼”å‘˜", "details.related": "ç›¸å…³æŽ¨è", "details.similarAnime": "ç›¸ä¼¼åŠ¨ç”»",
  "details.similarSeries": "ç›¸ä¼¼å‰§é›†", "details.seasonsEpisodes": "{seasons} å­£ Â· {episodes} é›†",
  "details.directors": "Directors", "details.direction": "Direction", "details.creators": "Creators",
  "details.studios": "Studios", "details.animationStudios": "Animation studios",
  "player.trailer": "é¢„å‘Šç‰‡", "player.audio": "éŸ³é¢‘", "player.subtitles": "å­—å¹•", "player.off": "å…³é—­",
  "player.singleAudio": "ä»…æœ‰ä¸€æ¡éŸ³è½¨", "player.episode": "ç¬¬ {episode} é›†",
  "player.episodeOf": "ç¬¬ {episode} / {total} é›†", "player.episodeNavigation": "å‰§é›†å¯¼èˆª",
  "player.previous": "ä¸Šä¸€é›†", "player.next": "ä¸‹ä¸€é›†", "player.related": "ç›¸å…³æŽ¨è",
  "player.prepareError": "æ— æ³•ä¸ºæ­¤æµè§ˆå™¨å‡†å¤‡è§†é¢‘æˆ–éŸ³é¢‘ã€‚", "player.hlsError": "æ­¤æµè§ˆå™¨æ— æ³•æ‰“å¼€ HLS æµã€‚",
  "player.hlsFallback": "æ­¤æµè§ˆå™¨ä¸æ”¯æŒ HLSï¼Œå·²å°è¯•æ’­æ”¾åŽŸå§‹æ–‡ä»¶ã€‚",
  "tmdb.loadError": "æ— æ³•åŠ è½½ TMDB æ•°æ®", "movie.unknown": "æœªçŸ¥æ ‡é¢˜", "movie.fallback": "Flick ç›®å½•ä¸­ä¸€æ®µå¼•äººå…¥èƒœçš„æ•…äº‹ã€‚",
  "language.label": "è¯­è¨€", "language.change": "åˆ‡æ¢è¯­è¨€",
  "genre.action": "åŠ¨ä½œ", "genre.horror": "ææ€–", "genre.comedy": "å–œå‰§", "genre.drama": "å‰§æƒ…",
  "genre.scifi": "ç§‘å¹»", "genre.thriller": "æƒŠæ‚š", "genre.adventure": "å†’é™©",
  "genre.fantasy": "å¥‡å¹»", "genre.documentary": "çºªå½•ç‰‡", "genre.crime": "çŠ¯ç½ª",
}

export const translations: Record<Lang, Dictionary> = { en, es, fr, hi, zh }

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && value in translations
}

export function detectLanguage(): Lang {
  if (typeof navigator === "undefined") return "en"
  try {
    const stored = localStorage.getItem("flick-lang")?.split("-")[0]?.toLowerCase()
    if (isLang(stored)) return stored
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
  const documentLang = document.documentElement.lang?.split("-")[0]?.toLowerCase()
  if (isLang(documentLang)) return documentLang
  const browser = navigator.language?.split("-")[0]?.toLowerCase()
  return isLang(browser) ? browser : "en"
}

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const text = translations[lang]?.[key] ?? translations.en[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
}

type CanonicalGenre =
  | "action" | "horror" | "comedy" | "drama" | "scifi" | "thriller"
  | "adventure" | "fantasy" | "documentary" | "crime" | "animation"
  | "family" | "mystery" | "romance" | "history" | "music" | "war"
  | "western" | "reality" | "soap" | "talk" | "news" | "kids" | "politics"
  | "action_adventure" | "scifi_fantasy"

const GENRE_LABELS: Record<CanonicalGenre, Record<Lang, string>> = {
  action: { en: "Action", es: "Acci\u00f3n", fr: "Action", hi: "\u090f\u0915\u094d\u0936\u0928", zh: "\u52a8\u4f5c" },
  horror: { en: "Horror", es: "Terror", fr: "Horreur", hi: "\u0939\u0949\u0930\u0930", zh: "\u6050\u6016" },
  comedy: { en: "Comedy", es: "Comedia", fr: "Com\u00e9die", hi: "\u0915\u0949\u092e\u0947\u0921\u0940", zh: "\u559c\u5267" },
  drama: { en: "Drama", es: "Drama", fr: "Drame", hi: "\u0921\u094d\u0930\u093e\u092e\u093e", zh: "\u5267\u60c5" },
  scifi: { en: "Science Fiction", es: "Ciencia ficci\u00f3n", fr: "Science-fiction", hi: "\u0935\u093f\u091c\u094d\u091e\u093e\u0928 \u0915\u0925\u093e", zh: "\u79d1\u5e7b" },
  thriller: { en: "Thriller", es: "Suspenso", fr: "Thriller", hi: "\u0925\u094d\u0930\u093f\u0932\u0930", zh: "\u60ca\u609a" },
  adventure: { en: "Adventure", es: "Aventura", fr: "Aventure", hi: "\u0930\u094b\u092e\u093e\u0902\u091a", zh: "\u5192\u9669" },
  fantasy: { en: "Fantasy", es: "Fantas\u00eda", fr: "Fantastique", hi: "\u092b\u0948\u0902\u091f\u0947\u0938\u0940", zh: "\u5947\u5e7b" },
  documentary: { en: "Documentary", es: "Documental", fr: "Documentaire", hi: "\u0921\u0949\u0915\u094d\u092f\u0942\u092e\u0947\u0902\u091f\u094d\u0930\u0940", zh: "\u7eaa\u5f55\u7247" },
  crime: { en: "Crime", es: "Crimen", fr: "Crime", hi: "\u0905\u092a\u0930\u093e\u0927", zh: "\u72af\u7f6a" },
  animation: { en: "Animation", es: "Animaci\u00f3n", fr: "Animation", hi: "\u090f\u0928\u0940\u092e\u0947\u0936\u0928", zh: "\u52a8\u753b" },
  family: { en: "Family", es: "Familia", fr: "Famille", hi: "\u092a\u0930\u093f\u0935\u093e\u0930", zh: "\u5bb6\u5ead" },
  mystery: { en: "Mystery", es: "Misterio", fr: "Myst\u00e8re", hi: "\u0930\u0939\u0938\u094d\u092f", zh: "\u60ac\u7591" },
  romance: { en: "Romance", es: "Romance", fr: "Romance", hi: "\u0930\u094b\u092e\u093e\u0902\u0938", zh: "\u7231\u60c5" },
  history: { en: "History", es: "Historia", fr: "Histoire", hi: "\u0907\u0924\u093f\u0939\u093e\u0938", zh: "\u5386\u53f2" },
  music: { en: "Music", es: "M\u00fasica", fr: "Musique", hi: "\u0938\u0902\u0917\u0940\u0924", zh: "\u97f3\u4e50" },
  war: { en: "War", es: "B\u00e9lica", fr: "Guerre", hi: "\u092f\u0941\u0926\u094d\u0927", zh: "\u6218\u4e89" },
  western: { en: "Western", es: "Western", fr: "Western", hi: "\u0935\u0947\u0938\u094d\u091f\u0930\u094d\u0928", zh: "\u897f\u90e8" },
  reality: { en: "Reality", es: "Reality", fr: "T\u00e9l\u00e9r\u00e9alit\u00e9", hi: "\u0930\u093f\u092f\u0932\u093f\u091f\u0940", zh: "\u771f\u4eba\u79c0" },
  soap: { en: "Soap", es: "Telenovela", fr: "Feuilleton", hi: "\u0938\u094b\u092a", zh: "\u80a5\u7682\u5267" },
  talk: { en: "Talk", es: "Entrevistas", fr: "Talk-show", hi: "\u0935\u093e\u0930\u094d\u0924\u093e", zh: "\u8131\u53e3\u79c0" },
  news: { en: "News", es: "Noticias", fr: "Actualit\u00e9s", hi: "\u0938\u092e\u093e\u091a\u093e\u0930", zh: "\u65b0\u95fb" },
  kids: { en: "Kids", es: "Infantil", fr: "Enfants", hi: "\u092c\u091a\u094d\u091a\u0947", zh: "\u513f\u7ae5" },
  politics: { en: "War & Politics", es: "B\u00e9lica y pol\u00edtica", fr: "Guerre et politique", hi: "\u092f\u0941\u0926\u094d\u0927 \u0914\u0930 \u0930\u093e\u091c\u0928\u0940\u0924\u093f", zh: "\u6218\u4e89\u4e0e\u653f\u6cbb" },
  action_adventure: { en: "Action & Adventure", es: "Acci\u00f3n y aventura", fr: "Action et aventure", hi: "\u090f\u0915\u094d\u0936\u0928 \u0914\u0930 \u0930\u094b\u092e\u093e\u0902\u091a", zh: "\u52a8\u4f5c\u4e0e\u5192\u9669" },
  scifi_fantasy: { en: "Sci-Fi & Fantasy", es: "Ciencia ficci\u00f3n y fantas\u00eda", fr: "Science-fiction et fantastique", hi: "\u0935\u093f\u091c\u094d\u091e\u093e\u0928 \u0915\u0925\u093e \u0914\u0930 \u092b\u0948\u0902\u091f\u0947\u0938\u0940", zh: "\u79d1\u5e7b\u4e0e\u5947\u5e7b" },
}
const GENRE_ALIASES: Record<string, CanonicalGenre> = {
  action: "action", accion: "action",
  "action and adventure": "action_adventure", "accion y aventura": "action_adventure", "action adventure": "action_adventure",
  horror: "horror", terror: "horror",
  comedy: "comedy", comedia: "comedy", comedie: "comedy",
  drama: "drama", drame: "drama",
  "science fiction": "scifi", "science-fiction": "scifi", "ciencia ficcion": "scifi", "sci fi": "scifi", "sci-fi": "scifi",
  "science fiction and fantasy": "scifi_fantasy", "sci fi and fantasy": "scifi_fantasy", "sci fi fantasy": "scifi_fantasy", "ciencia ficcion y fantasia": "scifi_fantasy",
  thriller: "thriller", suspense: "thriller", supense: "thriller", suspenso: "thriller",
  adventure: "adventure", aventura: "adventure", aventure: "adventure",
  fantasy: "fantasy", fantasia: "fantasy", fantastique: "fantasy",
  documentary: "documentary", documental: "documentary", documentaire: "documentary",
  crime: "crime", crimen: "crime",
  animation: "animation", animacion: "animation", anime: "animation",
  family: "family", familia: "family",
  mystery: "mystery", misterio: "mystery",
  romance: "romance",
  history: "history", historia: "history",
  music: "music", musica: "music",
  war: "war", guerra: "war", belica: "war",
  western: "western",
  reality: "reality", telerrealidad: "reality",
  soap: "soap", telenovela: "soap",
  talk: "talk", entrevistas: "talk",
  news: "news", noticias: "news",
  kids: "kids", infantil: "kids",
  "war and politics": "politics", "war politics": "politics", "belica y politica": "politics",
}

function genreKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function currentGenreLang(lang: Lang): Lang {
  if (typeof document !== "undefined") {
    const documentLang = document.documentElement.lang?.split("-")[0]?.toLowerCase()
    if (isLang(documentLang)) return documentLang
  }
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem("flick-lang")?.split("-")[0]?.toLowerCase()
      if (isLang(stored)) return stored
    } catch {
      // Storage can be unavailable in private or restricted contexts.
    }
  }
  return lang
}

export function translateGenre(value: string | null | undefined, lang: Lang): string {
  const displayLang = currentGenreLang(lang)
  return (value || t("common.general", displayLang))
    .split(",")
    .map((part) => {
      const clean = part.trim()
      const canonical = GENRE_ALIASES[genreKey(clean)]
      return canonical ? GENRE_LABELS[canonical][displayLang] : clean
    })
    .join(", ")
}

export function translateGenres(value: string | null | undefined, lang: Lang): string[] {
  return (value || t("common.general", lang))
    .split(",")
    .map((part) => translateGenre(part.trim(), lang))
    .filter(Boolean)
}
const LANGUAGE_CODES: Record<string, string> = {
  español: "es", spanish: "es", espagnol: "es",
  inglés: "en", english: "en", anglais: "en",
  japonés: "ja", japanese: "ja", japonais: "ja",
  francés: "fr", french: "fr", français: "fr",
  coreano: "ko", korean: "ko", coréen: "ko",
  alemán: "de", german: "de", allemand: "de",
  italiano: "it", italian: "it", italien: "it",
  portugués: "pt", portuguese: "pt", portugais: "pt",
  chino: "zh", chinese: "zh", chinois: "zh",
}

export function displayLanguage(value: string, lang: Lang): string {
  const code = LANGUAGE_CODES[value.trim().toLocaleLowerCase()] || value.trim().split("-")[0]
  try {
    return new Intl.DisplayNames([INTL_LOCALES[lang]], { type: "language" }).of(code) || value
  } catch {
    return value
  }
}

