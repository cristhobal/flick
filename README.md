<div align="center">

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/flick-Personal%20Streaming%20Platform-FAFAFA?style=for-the-badge&logo=astro&logoColor=080808&labelColor=FAFAFA">
  <img alt="flick" src="https://img.shields.io/badge/flick-Personal%20Streaming%20Platform-080808?style=for-the-badge&logo=astro&logoColor=FAFAFA&labelColor=080808">
</picture>

<br />
<br />

**A personal streaming interface for local media libraries and [TMDB](https://www.themoviedb.org/) discovery.**
Browse movies, series, and anime through an Astro + React experience inspired by modern streaming platforms.

<br />

[![Astro](https://img.shields.io/badge/Astro-6-080808?style=flat-square&logo=astro&logoColor=FAFAFA)](https://astro.build)
[![React](https://img.shields.io/badge/React-19-080808?style=flat-square&logo=react&logoColor=FAFAFA)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-080808?style=flat-square&logo=node.js&logoColor=FAFAFA)](https://nodejs.org)
[![Vercel](https://img.shields.io/badge/Vercel-live-080808?style=flat-square&logo=vercel&logoColor=FAFAFA)](https://withflick.vercel.app/)

<br />

[English](README.md) · [中文](docs/zh.md) · [हिन्दी](docs/hi.md) · [Español](docs/es.md) · [Français](docs/fr.md)

<br />

**🌐 [Live deployment](https://withflick.vercel.app/) — TMDB catalog and responsive streaming UI**

<br />

</div>

---

## Overview

**Flick** provides two data modes from the same interface, selected automatically by environment — no manual toggling per deploy:

- **TMDB mode** (production, `withflick.vercel.app`) for catalog discovery, search, metadata, cast information, artwork, and YouTube trailers. This is the only mode compiled into the production build.
- **Local mode** (`pnpm dev` only) scans a real local media folder on disk and plays the actual video files — with real-time audio-track and subtitle switching — instead of trailers.

The application is statically built with Astro while React handles navigation, filtering, detail views, previews, and playback state. The local-mode code path is dev-only middleware (a Vite plugin with `apply: "serve"`) and a build-time Rollup swap strips its heavier dependencies out of the production bundle entirely, so the TMDB production build is unaffected either way.

---

## Features

- Responsive home screen with rotating hero content and horizontal catalog rows
- Movies, series, and anime sections with search, filters, sorting, and detail pages
- TMDB metadata, posters, backdrops, genres, ratings, cast, and trailers
- Netflix-style movie cards with hover previews, consistently aligned to the card's height
- A `/library` view with quick filter tabs (All / Movies / Series / Anime)
- **Local dev media library** — scans a real folder on disk on the fly (no generated catalog file) and enriches each title with TMDB metadata, restricted to what's actually available locally
- **Custom video player** built from scratch (dev mode) with:
  - Real-time audio-track and subtitle switching with no restart, no rebuffering, and no A/V desync — a muted `<video>` acts as the master clock while a separate transcoded `<audio>` element is kept in lockstep by a dedicated sync manager
  - Styled ASS/SSA subtitle rendering via JASSUB (WASM libass), including fonts embedded in the source file
  - A right-click context menu (not dropdowns) for playback speed, audio track, and subtitle track — fullscreen-aware
  - Auto-hiding controls, ±10s skip buttons, a hover-preview seek bar, and a volume slider with a live-updating icon
- Static deployment support on Vercel for TMDB mode

---

## Technology

| Layer | Technology |
|---|---|
| Framework | Astro 6 |
| UI runtime | React 19 |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui + Radix UI |
| Metadata | TMDB API |
| Local playback | Native `<video>`/`<audio>`, FFmpeg/FFprobe, JASSUB (WASM libass) |
| Package manager | pnpm |
| Deployment | Vercel |

---

## Requirements

- Node.js >= 22.12
- pnpm
- FFmpeg and FFprobe available in `PATH` for local media mode
- A local movie library folder when using local dev mode (see below)

---

## Installation

```bash
git clone https://github.com/cristhobal/flick.git
cd flick
pnpm install
```

Copy the environment example:

```bash
cp .env.example .env
```

Select a data source:

```dotenv
# Local media library
DATA_SOURCE=local

# TMDB catalog in a local build
DATA_SOURCE=tmdb
```

Then start the development server:

```bash
pnpm dev
```

---

## Data modes

### TMDB

TMDB mode loads catalog data directly in the browser. Content only exposes the play action when an actual trailer is available; otherwise Flick shows the title information without opening an empty player.

For Vercel, configure this environment variable for Production, Preview, and Development:

```dotenv
PUBLIC_DATA_SOURCE=tmdb
```

### Local library

Local mode only runs under `pnpm dev`. A Vite dev-only plugin (`scripts/local-media-server.mjs`) scans a folder on disk on every request and serves it through a handful of local API endpoints — video, audio-track extraction, subtitle conversion, and embedded-font extraction — with disk caching so repeated requests stay fast.

```dotenv
DATA_SOURCE=local
PUBLIC_DATA_SOURCE=local

# Optional — if unset, Flick looks for a "Peliculas" folder automatically:
# any drive letter on Windows (D:\Peliculas, E:\Peliculas, ...), mounted
# volumes on Linux/macOS (/run/media, /media, /mnt, /Volumes), and common
# home-folder locations (~/Peliculas, ~/Videos/Peliculas, ~/Movies/Peliculas).
LOCAL_MOVIES_DIR=/path/to/your/movies/library
```

Recommended structure:

```text
Peliculas/
├── Movie Name (2024).mkv
├── ANIME/
│   └── Películas/
│       └── Anime Name (2016).mkv
└── Series/
    └── Series Name (2023)/
        ├── Season 1/
        │   ├── S01E01.mkv
        │   └── S01E02.mkv
```

Only titles that actually exist in the folder are shown — the catalog is not pre-generated, so there's nothing to keep in sync. Local playback endpoints are dev/preview middleware and require access to the host machine; they are not available from a standard static Vercel deployment, and none of this code is included in the production bundle.

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Astro; the local media library, if enabled, is scanned live on request |
| `pnpm build` | Create the production build in `dist` (local-mode code is excluded) |
| `pnpm preview` | Preview the production build locally |
| `pnpm typecheck` | Run Astro and TypeScript diagnostics |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format Astro, TypeScript, and TSX files |

---

## Deployment

1. Import `https://github.com/cristhobal/flick` into Vercel.
2. Keep the detected framework as Astro.
3. Set `PUBLIC_DATA_SOURCE=tmdb`.
4. Deploy using the existing `vercel.json` configuration.

The build command is `astro build` and the output directory is `dist`.

---

## Project structure

```text
src/
├── components/    React screens, cards, navigation, and the custom player
├── layouts/       Astro document layout
├── lib/           TMDB, catalog switching, media sync, ASS rendering, hooks
├── pages/         Astro routes
└── styles/        Global styles and animations
scripts/
└── local-media-server.mjs   Dev-only local library scanner and media API (excluded from production)
public/            Static assets
```

---

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
```

Before submitting changes, ensure both type checking and the production build complete successfully.

---

## Disclaimer

Flick is a personal media interface. TMDB metadata and images are provided by TMDB. The project is not endorsed or certified by TMDB. Users are responsible for the media they access and host locally.
