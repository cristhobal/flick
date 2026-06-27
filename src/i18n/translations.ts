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
  "site.title": "Flick — Your personal streaming platform", "site.description": "Explore movies, series and anime from TMDB or your local media library.",
  "nav.home": "Home", "nav.movies": "Movies", "nav.series": "Series", "nav.anime": "Anime",
  "nav.favorites": "Favorites", "nav.library": "Library", "nav.main": "Main navigation",
  "common.search": "Search", "common.searchContent": "Search movies, series, anime...", "common.searchShort": "Search...",
  "common.play": "Play", "common.details": "View details", "common.favoritesSoon": "Favorites · Coming soon",
  "common.comingSoon": "Coming soon", "common.availableSoon": "Available soon", "common.viewAll": "View all",
  "common.noResults": "No results found", "common.noAvailable": "Not available", "common.all": "All",
  "common.movies": "Movies", "common.series": "Series", "common.anime": "Anime", "common.catalog": "Full catalog",
  "common.episodes": "episodes", "common.season": "Season", "common.general": "General", "common.retry": "Retry",
  "common.loading": "Loading your catalog...", "common.titles": "titles", "common.of": "of",
  "home.featured": "Featured content", "home.recent": "Recently added", "home.continue": "Continue watching",
  "home.featuredMovies": "Featured movies", "home.action": "Action", "home.horror": "Horror", "home.comedy": "Comedy",
  "favorites.unavailable": "Favorites are not available yet.",
  "search.noTitle": "No results", "search.noDescription": "We couldn't find content for “{query}”. Try another search term or adjust the filters.",
  "search.exploreTitle": "Explore your library", "search.exploreDescription": "Search movies, series and anime, or browse by category.",
  "search.suggestions": "Search suggestions", "search.mostViewed": "Most viewed", "search.justAdded": "Just added",
  "search.topRated": "Top rated", "search.resultsFor": "{count} result{suffix} for “{query}”",
  "category.filter": "Filter {title}...", "category.categories": "Categories", "category.sort": "Sort",
  "category.recent": "Most recent", "category.rating": "Top rated", "category.alpha": "A-Z",
  "category.count": "{shown} of {total} titles",
  "library.title": "Library", "library.count": "{count} titles in your library", "library.filter": "Filter library...", "library.everything": "All",
  "filters.title": "Filters", "filters.clear": "Clear all", "filters.description": "Filters and sorting",
  "filters.sortBy": "Sort by", "filters.type": "Type", "filters.genre": "Genre", "filters.quality": "Quality",
  "filters.recent": "Most recent", "filters.rating": "Top rated", "filters.duration": "Duration",
  "details.label": "Details for {title}", "details.synopsis": "Synopsis", "details.subtitlesAvailable": "Available subtitles",
  "details.episodes": "Episodes", "details.cast": "Cast", "details.related": "Related", "details.similarAnime": "Similar anime",
  "details.similarSeries": "Similar series", "details.seasonsEpisodes": "{seasons} seasons · {episodes} episodes",
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
  "site.title": "Flick — Tu plataforma personal de streaming", "site.description": "Explora películas, series y anime desde TMDB o tu biblioteca multimedia local.",
  "nav.home": "Inicio", "nav.movies": "Películas", "nav.series": "Series", "nav.anime": "Anime",
  "nav.favorites": "Favoritos", "nav.library": "Biblioteca", "nav.main": "Navegación principal",
  "common.search": "Buscar", "common.searchContent": "Buscar películas, series, anime...", "common.searchShort": "Buscar...",
  "common.play": "Reproducir", "common.details": "Ver detalles", "common.favoritesSoon": "Favoritos · Próximamente",
  "common.comingSoon": "Próximamente", "common.availableSoon": "Disponible próximamente", "common.viewAll": "Ver todo",
  "common.noResults": "No se encontraron resultados", "common.noAvailable": "No disponible", "common.all": "Todas",
  "common.movies": "Películas", "common.series": "Series", "common.anime": "Anime", "common.catalog": "Todo el catálogo",
  "common.episodes": "episodios", "common.season": "Temporada", "common.general": "General", "common.retry": "Reintentar",
  "common.loading": "Cargando tu catálogo...", "common.titles": "títulos", "common.of": "de",
  "home.featured": "Contenido destacado", "home.recent": "Agregadas recientemente", "home.continue": "Continuar viendo",
  "home.featuredMovies": "Películas destacadas", "home.action": "Acción", "home.horror": "Terror", "home.comedy": "Comedia",
  "favorites.unavailable": "La función de favoritos todavía no está disponible.",
  "search.noTitle": "Sin resultados", "search.noDescription": "No encontramos contenido para “{query}”. Intenta con otro término o ajusta los filtros.",
  "search.exploreTitle": "Explora tu biblioteca", "search.exploreDescription": "Busca películas, series y anime, o explora por categorías.",
  "search.suggestions": "Sugerencias de búsqueda", "search.mostViewed": "Más vistos", "search.justAdded": "Recién agregados",
  "search.topRated": "Mejor valorados", "search.resultsFor": "{count} resultado{suffix} para “{query}”",
  "category.filter": "Filtrar {title}...", "category.categories": "Categorías", "category.sort": "Ordenar",
  "category.recent": "Más recientes", "category.rating": "Mejor valorados", "category.alpha": "A-Z",
  "category.count": "{shown} de {total} títulos",
  "library.title": "Biblioteca", "library.count": "{count} títulos en tu biblioteca", "library.filter": "Filtrar biblioteca...", "library.everything": "Todo",
  "filters.title": "Filtros", "filters.clear": "Limpiar todo", "filters.description": "Filtros y ordenamiento",
  "filters.sortBy": "Ordenar por", "filters.type": "Tipo", "filters.genre": "Género", "filters.quality": "Calidad",
  "filters.recent": "Más reciente", "filters.rating": "Mejor valorado", "filters.duration": "Duración",
  "details.label": "Detalles de {title}", "details.synopsis": "Sinopsis", "details.subtitlesAvailable": "Subtítulos disponibles",
  "details.episodes": "Episodios", "details.cast": "Reparto", "details.related": "Relacionados", "details.similarAnime": "Animes similares",
  "details.similarSeries": "Series similares", "details.seasonsEpisodes": "{seasons} temporadas · {episodes} episodios",
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
  "site.title": "Flick — Votre plateforme de streaming personnelle", "site.description": "Explorez films, séries et anime depuis TMDB ou votre médiathèque locale.",
  "nav.home": "Accueil", "nav.movies": "Films", "nav.series": "Séries", "nav.anime": "Anime",
  "nav.favorites": "Favoris", "nav.library": "Bibliothèque", "nav.main": "Navigation principale",
  "common.search": "Rechercher", "common.searchContent": "Rechercher des films, séries, anime...", "common.searchShort": "Rechercher...",
  "common.play": "Lire", "common.details": "Voir les détails", "common.favoritesSoon": "Favoris · Bientôt",
  "common.comingSoon": "Bientôt", "common.availableSoon": "Disponible prochainement", "common.viewAll": "Tout voir",
  "common.noResults": "Aucun résultat", "common.noAvailable": "Indisponible", "common.all": "Toutes",
  "common.movies": "Films", "common.series": "Séries", "common.anime": "Anime", "common.catalog": "Catalogue complet",
  "common.episodes": "épisodes", "common.season": "Saison", "common.general": "Général", "common.retry": "Réessayer",
  "common.loading": "Chargement du catalogue...", "common.titles": "titres", "common.of": "sur",
  "home.featured": "Contenu à la une", "home.recent": "Ajoutés récemment", "home.continue": "Continuer à regarder",
  "home.featuredMovies": "Films à la une", "home.action": "Action", "home.horror": "Horreur", "home.comedy": "Comédie",
  "favorites.unavailable": "Les favoris ne sont pas encore disponibles.",
  "search.noTitle": "Aucun résultat", "search.noDescription": "Aucun contenu trouvé pour « {query} ». Essayez un autre terme ou modifiez les filtres.",
  "search.exploreTitle": "Explorez votre bibliothèque", "search.exploreDescription": "Recherchez des films, séries et anime, ou parcourez les catégories.",
  "search.suggestions": "Suggestions de recherche", "search.mostViewed": "Les plus vus", "search.justAdded": "Ajoutés récemment",
  "search.topRated": "Les mieux notés", "search.resultsFor": "{count} résultat{suffix} pour « {query} »",
  "category.filter": "Filtrer {title}...", "category.categories": "Catégories", "category.sort": "Trier",
  "category.recent": "Plus récents", "category.rating": "Mieux notés", "category.alpha": "A-Z",
  "category.count": "{shown} sur {total} titres",
  "library.title": "Bibliothèque", "library.count": "{count} titres dans votre bibliothèque", "library.filter": "Filtrer la bibliothèque...", "library.everything": "Tout",
  "filters.title": "Filtres", "filters.clear": "Tout effacer", "filters.description": "Filtres et tri",
  "filters.sortBy": "Trier par", "filters.type": "Type", "filters.genre": "Genre", "filters.quality": "Qualité",
  "filters.recent": "Plus récent", "filters.rating": "Mieux noté", "filters.duration": "Durée",
  "details.label": "Détails de {title}", "details.synopsis": "Synopsis", "details.subtitlesAvailable": "Sous-titres disponibles",
  "details.episodes": "Épisodes", "details.cast": "Distribution", "details.related": "Similaires", "details.similarAnime": "Anime similaires",
  "details.similarSeries": "Séries similaires", "details.seasonsEpisodes": "{seasons} saisons · {episodes} épisodes",
  "player.trailer": "Bande-annonce", "player.audio": "Audio", "player.subtitles": "Sous-titres", "player.off": "Désactivés",
  "player.singleAudio": "Une seule piste audio est disponible", "player.episode": "Épisode {episode}",
  "player.episodeOf": "Épisode {episode} sur {total}", "player.episodeNavigation": "Navigation des épisodes",
  "player.previous": "Épisode précédent", "player.next": "Épisode suivant", "player.related": "Similaires",
  "player.prepareError": "Impossible de préparer la vidéo ou l'audio pour ce navigateur.",
  "player.hlsError": "Ce navigateur n'a pas pu ouvrir le flux HLS.",
  "player.hlsFallback": "Ce navigateur ne prend pas en charge HLS ; le fichier original a été essayé.",
  "tmdb.loadError": "Impossible de charger les données TMDB", "movie.unknown": "Titre inconnu", "movie.fallback": "Une histoire captivante disponible dans votre catalogue Flick.",
  "language.label": "Langue", "language.change": "Changer de langue",
  "genre.action": "Action", "genre.horror": "Horreur", "genre.comedy": "Comédie", "genre.drama": "Drame",
  "genre.scifi": "Science-fiction", "genre.thriller": "Thriller", "genre.adventure": "Aventure",
  "genre.fantasy": "Fantastique", "genre.documentary": "Documentaire", "genre.crime": "Crime",
}

const hi: Dictionary = {
  "site.title": "Flick — आपका निजी स्ट्रीमिंग प्लेटफ़ॉर्म", "site.description": "TMDB या अपनी स्थानीय मीडिया लाइब्रेरी से फ़िल्में, सीरीज़ और ऐनिमे खोजें।",
  "nav.home": "होम", "nav.movies": "फ़िल्में", "nav.series": "सीरीज़", "nav.anime": "ऐनिमे",
  "nav.favorites": "पसंदीदा", "nav.library": "लाइब्रेरी", "nav.main": "मुख्य नेविगेशन",
  "common.search": "खोजें", "common.searchContent": "फ़िल्में, सीरीज़, ऐनिमे खोजें...", "common.searchShort": "खोजें...",
  "common.play": "चलाएँ", "common.details": "विवरण देखें", "common.favoritesSoon": "पसंदीदा · जल्द",
  "common.comingSoon": "जल्द आ रहा है", "common.availableSoon": "जल्द उपलब्ध", "common.viewAll": "सभी देखें",
  "common.noResults": "कोई परिणाम नहीं मिला", "common.noAvailable": "उपलब्ध नहीं", "common.all": "सभी",
  "common.movies": "फ़िल्में", "common.series": "सीरीज़", "common.anime": "ऐनिमे", "common.catalog": "पूरा कैटलॉग",
  "common.episodes": "एपिसोड", "common.season": "सीज़न", "common.general": "सामान्य", "common.retry": "फिर प्रयास करें",
  "common.loading": "कैटलॉग लोड हो रहा है...", "common.titles": "शीर्षक", "common.of": "में से",
  "home.featured": "विशेष सामग्री", "home.recent": "हाल ही में जोड़े गए", "home.continue": "देखना जारी रखें",
  "home.featuredMovies": "विशेष फ़िल्में", "home.action": "एक्शन", "home.horror": "हॉरर", "home.comedy": "कॉमेडी",
  "favorites.unavailable": "पसंदीदा सुविधा अभी उपलब्ध नहीं है।",
  "search.noTitle": "कोई परिणाम नहीं", "search.noDescription": "“{query}” के लिए सामग्री नहीं मिली। दूसरा शब्द या फ़िल्टर आज़माएँ।",
  "search.exploreTitle": "अपनी लाइब्रेरी खोजें", "search.exploreDescription": "फ़िल्में, सीरीज़ और ऐनिमे खोजें या श्रेणियाँ देखें।",
  "search.suggestions": "खोज सुझाव", "search.mostViewed": "सबसे अधिक देखे गए", "search.justAdded": "हाल में जोड़े गए",
  "search.topRated": "शीर्ष रेटेड", "search.resultsFor": "“{query}” के लिए {count} परिणाम",
  "category.filter": "{title} फ़िल्टर करें...", "category.categories": "श्रेणियाँ", "category.sort": "क्रम",
  "category.recent": "नवीनतम", "category.rating": "शीर्ष रेटेड", "category.alpha": "A-Z",
  "category.count": "{total} में से {shown} शीर्षक",
  "library.title": "लाइब्रेरी", "library.count": "आपकी लाइब्रेरी में {count} शीर्षक", "library.filter": "लाइब्रेरी फ़िल्टर करें...", "library.everything": "सभी",
  "filters.title": "फ़िल्टर", "filters.clear": "सभी साफ़ करें", "filters.description": "फ़िल्टर और क्रम",
  "filters.sortBy": "क्रमबद्ध करें", "filters.type": "प्रकार", "filters.genre": "शैली", "filters.quality": "गुणवत्ता",
  "filters.recent": "नवीनतम", "filters.rating": "शीर्ष रेटेड", "filters.duration": "अवधि",
  "details.label": "{title} का विवरण", "details.synopsis": "सारांश", "details.subtitlesAvailable": "उपलब्ध उपशीर्षक",
  "details.episodes": "एपिसोड", "details.cast": "कलाकार", "details.related": "संबंधित", "details.similarAnime": "समान ऐनिमे",
  "details.similarSeries": "समान सीरीज़", "details.seasonsEpisodes": "{seasons} सीज़न · {episodes} एपिसोड",
  "player.trailer": "ट्रेलर", "player.audio": "ऑडियो", "player.subtitles": "उपशीर्षक", "player.off": "बंद",
  "player.singleAudio": "केवल एक ऑडियो ट्रैक उपलब्ध है", "player.episode": "एपिसोड {episode}",
  "player.episodeOf": "{total} में से एपिसोड {episode}", "player.episodeNavigation": "एपिसोड नेविगेशन",
  "player.previous": "पिछला एपिसोड", "player.next": "अगला एपिसोड", "player.related": "संबंधित",
  "player.prepareError": "इस ब्राउज़र के लिए वीडियो या ऑडियो तैयार नहीं किया जा सका।",
  "player.hlsError": "यह ब्राउज़र HLS स्ट्रीम नहीं खोल सका।",
  "player.hlsFallback": "यह ब्राउज़र HLS का समर्थन नहीं करता; मूल फ़ाइल आज़माई गई।",
  "tmdb.loadError": "TMDB डेटा लोड नहीं हो सका", "movie.unknown": "अज्ञात शीर्षक", "movie.fallback": "आपके Flick कैटलॉग में उपलब्ध एक रोचक कहानी।",
  "language.label": "भाषा", "language.change": "भाषा बदलें",
  "genre.action": "एक्शन", "genre.horror": "हॉरर", "genre.comedy": "कॉमेडी", "genre.drama": "ड्रामा",
  "genre.scifi": "विज्ञान कथा", "genre.thriller": "थ्रिलर", "genre.adventure": "रोमांच",
  "genre.fantasy": "फैंटेसी", "genre.documentary": "डॉक्यूमेंट्री", "genre.crime": "अपराध",
}

const zh: Dictionary = {
  "site.title": "Flick — 你的个人流媒体平台", "site.description": "浏览来自 TMDB 或本地媒体库的电影、剧集和动画。",
  "nav.home": "首页", "nav.movies": "电影", "nav.series": "剧集", "nav.anime": "动画",
  "nav.favorites": "收藏", "nav.library": "媒体库", "nav.main": "主导航",
  "common.search": "搜索", "common.searchContent": "搜索电影、剧集、动画...", "common.searchShort": "搜索...",
  "common.play": "播放", "common.details": "查看详情", "common.favoritesSoon": "收藏 · 即将推出",
  "common.comingSoon": "即将推出", "common.availableSoon": "即将可用", "common.viewAll": "查看全部",
  "common.noResults": "未找到结果", "common.noAvailable": "不可用", "common.all": "全部",
  "common.movies": "电影", "common.series": "剧集", "common.anime": "动画", "common.catalog": "完整目录",
  "common.episodes": "集", "common.season": "季", "common.general": "综合", "common.retry": "重试",
  "common.loading": "正在加载目录...", "common.titles": "个标题", "common.of": "/",
  "home.featured": "精选内容", "home.recent": "最近添加", "home.continue": "继续观看",
  "home.featuredMovies": "精选电影", "home.action": "动作", "home.horror": "恐怖", "home.comedy": "喜剧",
  "favorites.unavailable": "收藏功能尚未开放。",
  "search.noTitle": "没有结果", "search.noDescription": "未找到“{query}”的内容，请尝试其他关键词或调整筛选条件。",
  "search.exploreTitle": "探索媒体库", "search.exploreDescription": "搜索电影、剧集和动画，或按分类浏览。",
  "search.suggestions": "搜索建议", "search.mostViewed": "最多观看", "search.justAdded": "最近添加",
  "search.topRated": "最高评分", "search.resultsFor": "“{query}”共有 {count} 个结果",
  "category.filter": "筛选{title}...", "category.categories": "分类", "category.sort": "排序",
  "category.recent": "最新", "category.rating": "最高评分", "category.alpha": "A-Z",
  "category.count": "显示 {shown} / {total} 个标题",
  "library.title": "媒体库", "library.count": "媒体库中有 {count} 个标题", "library.filter": "筛选媒体库...", "library.everything": "全部",
  "filters.title": "筛选", "filters.clear": "全部清除", "filters.description": "筛选与排序",
  "filters.sortBy": "排序方式", "filters.type": "类型", "filters.genre": "题材", "filters.quality": "画质",
  "filters.recent": "最新", "filters.rating": "最高评分", "filters.duration": "时长",
  "details.label": "{title}的详情", "details.synopsis": "简介", "details.subtitlesAvailable": "可用字幕",
  "details.episodes": "剧集", "details.cast": "演员", "details.related": "相关推荐", "details.similarAnime": "相似动画",
  "details.similarSeries": "相似剧集", "details.seasonsEpisodes": "{seasons} 季 · {episodes} 集",
  "player.trailer": "预告片", "player.audio": "音频", "player.subtitles": "字幕", "player.off": "关闭",
  "player.singleAudio": "仅有一条音轨", "player.episode": "第 {episode} 集",
  "player.episodeOf": "第 {episode} / {total} 集", "player.episodeNavigation": "剧集导航",
  "player.previous": "上一集", "player.next": "下一集", "player.related": "相关推荐",
  "player.prepareError": "无法为此浏览器准备视频或音频。", "player.hlsError": "此浏览器无法打开 HLS 流。",
  "player.hlsFallback": "此浏览器不支持 HLS，已尝试播放原始文件。",
  "tmdb.loadError": "无法加载 TMDB 数据", "movie.unknown": "未知标题", "movie.fallback": "Flick 目录中一段引人入胜的故事。",
  "language.label": "语言", "language.change": "切换语言",
  "genre.action": "动作", "genre.horror": "恐怖", "genre.comedy": "喜剧", "genre.drama": "剧情",
  "genre.scifi": "科幻", "genre.thriller": "惊悚", "genre.adventure": "冒险",
  "genre.fantasy": "奇幻", "genre.documentary": "纪录片", "genre.crime": "犯罪",
}

export const translations: Record<Lang, Dictionary> = { en, es, fr, hi, zh }

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && value in translations
}

export function detectLanguage(): Lang {
  if (typeof navigator === "undefined") return "en"
  const browser = navigator.language?.split("-")[0]?.toLowerCase()
  return isLang(browser) ? browser : "en"
}

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const text = translations[lang]?.[key] ?? translations.en[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
}

const GENRE_KEYS: Record<string, string> = {
  "acción": "genre.action", action: "genre.action", "एक्शन": "genre.action", "动作": "genre.action",
  terror: "genre.horror", horror: "genre.horror", horreur: "genre.horror", "हॉरर": "genre.horror", "恐怖": "genre.horror",
  comedia: "genre.comedy", comedy: "genre.comedy", "comédie": "genre.comedy", "कॉमेडी": "genre.comedy", "喜剧": "genre.comedy",
  drama: "genre.drama", drame: "genre.drama", "ड्रामा": "genre.drama", "剧情": "genre.drama",
  "ciencia ficción": "genre.scifi", "science fiction": "genre.scifi", "science-fiction": "genre.scifi", "विज्ञान कथा": "genre.scifi", "科幻": "genre.scifi",
  suspenso: "genre.thriller", thriller: "genre.thriller", "थ्रिलर": "genre.thriller", "惊悚": "genre.thriller",
  aventura: "genre.adventure", adventure: "genre.adventure", aventure: "genre.adventure", "रोमांच": "genre.adventure", "冒险": "genre.adventure",
  "fantasía": "genre.fantasy", fantasy: "genre.fantasy", fantastique: "genre.fantasy", "फैंटेसी": "genre.fantasy", "奇幻": "genre.fantasy",
  documental: "genre.documentary", documentary: "genre.documentary", documentaire: "genre.documentary", "डॉक्यूमेंट्री": "genre.documentary", "纪录片": "genre.documentary",
  crimen: "genre.crime", crime: "genre.crime", "अपराध": "genre.crime", "犯罪": "genre.crime",
  accion: "genre.action",
  "ciencia ficcion": "genre.scifi", "sci-fi": "genre.scifi",
  suspense: "genre.thriller", supense: "genre.thriller", Suspense: "genre.thriller", misterio: "genre.mystery", mystery: "genre.mystery", Misterio: "genre.mystery",
  animacion: "genre.animation", animation: "genre.animation", anime: "genre.animation",
  familia: "genre.family", family: "genre.family",
  romance: "genre.romance",
  historia: "genre.history", history: "genre.history",
  musica: "genre.music", music: "genre.music",
  belica: "genre.war", guerra: "genre.war", war: "genre.war",
  western: "genre.western",
  reality: "genre.reality",
  telenovela: "genre.soap", soap: "genre.soap",
  entrevistas: "genre.talk", talk: "genre.talk",
  noticias: "genre.news", news: "genre.news",
  infantil: "genre.kids", kids: "genre.kids",
  "war & politics": "genre.politics", "belica y politica": "genre.politics",
}

function genreKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function translateGenre(value: string | null | undefined, lang: Lang): string {
  return (value || t("common.general", lang))
    .split(",")
    .map((part) => {
      const clean = part.trim()
      // Three-pass lookup: NFD-normalized lowercase, plain lowercase, original casing
      const key =
        GENRE_KEYS[genreKey(clean)] ??
        GENRE_KEYS[clean.toLocaleLowerCase()] ??
        GENRE_KEYS[clean]
      if (key) return t(key, lang)
      // Last resort: check if the raw value matches any translation key directly
      // (handles cases like "Suspense" that should map to genre.thriller)
      const directKey = Object.keys(GENRE_KEYS).find(
        (k) => genreKey(k) === genreKey(clean)
      )
      return directKey ? t(GENRE_KEYS[directKey], lang) : clean
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
  español: "es", spanish: "es", espagnol: "es", "स्पेनिश": "es", "西班牙语": "es",
  inglés: "en", english: "en", anglais: "en", "अंग्रेज़ी": "en", "英语": "en",
  japonés: "ja", japanese: "ja", japonais: "ja", "जापानी": "ja", "日语": "ja",
  francés: "fr", french: "fr", français: "fr", "फ़्रेंच": "fr", "法语": "fr",
  coreano: "ko", korean: "ko", coréen: "ko", "कोरियाई": "ko", "韩语": "ko",
  alemán: "de", german: "de", allemand: "de", "जर्मन": "de", "德语": "de",
  italiano: "it", italian: "it", italien: "it", "इतालवी": "it", "意大利语": "it",
  portugués: "pt", portuguese: "pt", portugais: "pt", "पुर्तगाली": "pt", "葡萄牙语": "pt",
  chino: "zh", chinese: "zh", chinois: "zh", "चीनी": "zh", "中文": "zh",
}

export function displayLanguage(value: string, lang: Lang): string {
  const code = LANGUAGE_CODES[value.trim().toLocaleLowerCase()] || value.trim().split("-")[0]
  try {
    return new Intl.DisplayNames([INTL_LOCALES[lang]], { type: "language" }).of(code) || value
  } catch {
    return value
  }
}
