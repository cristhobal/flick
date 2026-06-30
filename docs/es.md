<div align="center">

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/flick-Plataforma%20de%20Streaming%20Personal-FAFAFA?style=for-the-badge&logo=astro&logoColor=080808&labelColor=FAFAFA">
  <img alt="flick" src="https://img.shields.io/badge/flick-Plataforma%20de%20Streaming%20Personal-080808?style=for-the-badge&logo=astro&logoColor=FAFAFA&labelColor=080808">
</picture>

<br />
<br />

**Una interfaz de streaming personal para bibliotecas locales y descubrimiento con [TMDB](https://www.themoviedb.org/).**
Explora películas, series y anime mediante una experiencia construida con Astro y React.

<br />

[![Astro](https://img.shields.io/badge/Astro-6-080808?style=flat-square&logo=astro&logoColor=FAFAFA)](https://astro.build)
[![React](https://img.shields.io/badge/React-19-080808?style=flat-square&logo=react&logoColor=FAFAFA)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-080808?style=flat-square&logo=node.js&logoColor=FAFAFA)](https://nodejs.org)
[![Vercel](https://img.shields.io/badge/Vercel-online-080808?style=flat-square&logo=vercel&logoColor=FAFAFA)](https://withflick.vercel.app/)

<br />

[English](../README.md) · [中文](zh.md) · [हिन्दी](hi.md) · [Español](es.md) · [Français](fr.md)

<br />

**🌐 [Despliegue en vivo](https://withflick.vercel.app/) — catálogo TMDB e interfaz adaptable**

<br />

</div>

---

## Resumen

**Flick** ofrece dos fuentes de datos desde una misma interfaz:

- **Modo TMDB:** catálogo, búsqueda, metadatos, reparto, imágenes y tráilers disponibles en YouTube.
- **Modo local:** escaneo y reproducción de contenido almacenado en `F:\Peliculas`, incluyendo películas, series, anime, pistas de audio y subtítulos.

Astro genera la aplicación estática y React controla la navegación, los filtros, las vistas de detalle y el reproductor.

---

## Características

- Inicio adaptable con hero rotativo y carruseles de contenido
- Secciones para películas, series y anime con búsqueda, filtros y ordenamiento
- Metadatos, imágenes, géneros, puntuaciones, reparto y tráilers de TMDB
- Escáner local que genera `public/movies.json`
- Reproducción de MP4, MKV, AVI, MOV, WMV, FLV, WebM y M4V
- Conversión HLS mediante FFmpeg cuando el navegador no puede reproducir directamente
- Subtítulos externos e integrados: SRT, VTT, ASS y SSA
- Detección de pistas de audio integradas y selector de idioma
- Despliegue estático en Vercel para el modo TMDB


---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Framework | Astro 6 |
| Interfaz | React 19 |
| Estilos | Tailwind CSS 4 |
| Componentes | shadcn/ui + Radix UI |
| Metadatos | API de TMDB |
| Reproducción | HLS.js, FFmpeg, ASS.js |
| Gestor | pnpm |
| Despliegue | Vercel |

---

## Requisitos

- Node.js >= 22.12
- pnpm
- FFmpeg y FFprobe disponibles en `PATH` para el modo local
- La carpeta `F:\Peliculas` para escanear y reproducir archivos locales

---

## Instalación

```bash
git clone https://github.com/cristhobal/flick.git
cd flick
pnpm install
copy .env.example .env
pnpm dev
```

Configura la fuente de datos en `.env`:

```dotenv
DATA_SOURCE=local
# o
DATA_SOURCE=tmdb
```

---

## Modos de datos

### TMDB

Carga el catálogo directamente en el navegador. Flick solo muestra la acción **Reproducir** cuando TMDB entrega un tráiler real; si no existe, se presenta únicamente la información del título.

En Vercel configura:

```dotenv
PUBLIC_DATA_SOURCE=tmdb
```

Activa la variable para Production, Preview y Development.

### Biblioteca local

El modo local escanea `F:\Peliculas` y genera `public/movies.json` antes de iniciar Astro.

```text
F:\Peliculas\
├── Película (2024).mkv
├── Película (2024).es.srt
├── series\
│   └── Nombre de la serie\
│       └── Season 1\
│           ├── S01E01.mkv
│           └── S01E02.mkv
└── animes\
    └── Nombre del anime\
        ├── 01.mkv
        └── 02.mkv
```

Los endpoints de reproducción local necesitan acceso a la máquina anfitriona y no funcionan en un despliegue estático convencional de Vercel.

---

## Scripts

| Comando | Descripción |
|---|---|
| `pnpm dev` | Escanea la biblioteca cuando corresponde e inicia Astro |
| `pnpm scan` | Genera el catálogo local |
| `pnpm build` | Construye la aplicación en `dist` |
| `pnpm preview` | Previsualiza el build localmente |
| `pnpm typecheck` | Ejecuta diagnósticos de Astro y TypeScript |
| `pnpm lint` | Ejecuta ESLint |
| `pnpm format` | Formatea archivos Astro, TypeScript y TSX |

---

## Despliegue

1. Importa el repositorio en Vercel.
2. Mantén Astro como framework.
3. Define `PUBLIC_DATA_SOURCE=tmdb`.
4. Despliega usando `vercel.json`.

El comando de construcción es `astro build` y el directorio de salida es `dist`.

---

## Estructura

```text
src/components/   Pantallas, tarjetas, navegación y reproductor
src/layouts/      Layout principal de Astro
src/lib/          TMDB, modelos, configuración y hooks
src/pages/        Rutas de Astro
src/styles/       Estilos y animaciones
scripts/scan.mjs  Escáner de la biblioteca local
```

---

## Desarrollo

```bash
pnpm install
pnpm typecheck
pnpm build
```

---

## Aviso

Flick es una interfaz de medios personal. Los metadatos e imágenes pertenecen a TMDB. Este proyecto no está respaldado ni certificado por TMDB. Cada usuario es responsable del contenido que aloja y reproduce localmente.
