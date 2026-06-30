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

**Flick** provides two data modes from the same interface:

- **TMDB mode** for catalog discovery, search, metadata, cast information, artwork, and available YouTube trailers.
- **Local mode** for scanning and playing media stored in `F:\Peliculas`, including movies, series, anime, audio tracks, and subtitles.

The application is statically built with Astro while React handles navigation, filtering, detail views, previews, and playback state.

---

## Features

- Responsive home screen with rotating hero content and horizontal catalog rows
- Movies, series, and anime sections with search, filters, sorting, and detail pages
- TMDB metadata, posters, backdrops, genres, ratings, cast, and trailers
- Local library scanner that generates `public/movies.json`
- Playback for MP4, MKV, AVI, MOV, WMV, FLV, WebM, and M4V sources
- HLS generation through FFmpeg when direct browser playback is not suitable
- External and embedded subtitle support, including SRT, VTT, ASS, and SSA
- Embedded audio-track discovery and language selection
- Responsive navigation and Netflix-style card previews
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
| Playback | HLS.js, FFmpeg, ASS.js |
| Package manager | pnpm |
| Deployment | Vercel |

---

## Requirements

- Node.js >= 22.12
- pnpm
- FFmpeg and FFprobe available in `PATH` for local media mode
- A local `F:\Peliculas` directory when using the scanner and local player

---

## Installation

```bash
git clone https://github.com/cristhobal/flick.git
cd flick
pnpm install
```

Copy the environment example:

```bash
copy .env.example .env
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

Local mode scans `F:\Peliculas` before starting Astro and writes the catalog to `public/movies.json`.

Recommended structure:

```text
F:\Peliculas\
├── Movie Name (2024).mkv
├── Movie Name (2024).es.srt
├── series\
│   └── Series Name (2023)\
│       ├── Season 1\
│       │   ├── S01E01.mkv
│       │   └── S01E02.mkv
└── animes\
    └── Anime Name\
        ├── 01.mkv
        └── 02.mkv
```

Local playback endpoints are development/preview middleware and require access to the host machine. They are not available from a standard static Vercel deployment.

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Scan the local library when enabled and start Astro |
| `pnpm scan` | Generate `public/movies.json` from the local library |
| `pnpm build` | Create the production build in `dist` |
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
├── components/    React screens, cards, navigation, and player
├── layouts/       Astro document layout
├── lib/           TMDB, data models, configuration, and hooks
├── pages/         Astro routes
└── styles/        Global styles and animations
scripts/
└── scan.mjs       Local library scanner and metadata enrichment
public/            Static assets and generated local catalog
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
