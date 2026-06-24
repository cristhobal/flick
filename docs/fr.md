<div align="center">

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/flick-Plateforme%20de%20Streaming%20Personnelle-FAFAFA?style=for-the-badge&logo=astro&logoColor=080808&labelColor=FAFAFA">
  <img alt="flick" src="https://img.shields.io/badge/flick-Plateforme%20de%20Streaming%20Personnelle-080808?style=for-the-badge&logo=astro&logoColor=FAFAFA&labelColor=080808">
</picture>

<br />
<br />

**Une interface de streaming personnelle pour les médiathèques locales et la découverte via [TMDB](https://www.themoviedb.org/).**
Parcourez films, séries et anime dans une expérience Astro + React moderne.

<br />

[![Astro](https://img.shields.io/badge/Astro-6-080808?style=flat-square&logo=astro&logoColor=FAFAFA)](https://astro.build)
[![React](https://img.shields.io/badge/React-19-080808?style=flat-square&logo=react&logoColor=FAFAFA)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-080808?style=flat-square&logo=node.js&logoColor=FAFAFA)](https://nodejs.org)
[![Vercel](https://img.shields.io/badge/Vercel-en%20ligne-080808?style=flat-square&logo=vercel&logoColor=FAFAFA)](https://withflick.vercel.app/)

<br />

[English](../README.md) · [中文](zh.md) · [हिन्दी](hi.md) · [Español](es.md) · [Français](fr.md)

<br />

**🌐 [Déploiement en ligne](https://withflick.vercel.app/) — catalogue TMDB et interface responsive**

<br />

</div>

---

## Aperçu

**Flick** propose deux sources de données dans la même interface :

- **Mode TMDB** pour le catalogue, la recherche, les métadonnées, les acteurs, les images et les bandes-annonces disponibles.
- **Mode local** pour analyser et lire les médias stockés dans `F:\Peliculas`, y compris les films, séries, anime, pistes audio et sous-titres.

Astro produit l'application statique, tandis que React gère la navigation, les filtres, les fiches détaillées et la lecture.

---

## Fonctionnalités

- Accueil responsive avec contenu principal rotatif et carrousels
- Films, séries et anime avec recherche, filtres et tri
- Métadonnées, affiches, arrière-plans, genres, notes, acteurs et bandes-annonces TMDB
- Analyse locale générant `public/movies.json`
- Lecture MP4, MKV, AVI, MOV, WMV, FLV, WebM et M4V
- Génération HLS avec FFmpeg pour les formats non pris en charge directement
- Sous-titres externes et intégrés : SRT, VTT, ASS et SSA
- Détection et sélection des pistes audio intégrées
- Déploiement statique Vercel pour le mode TMDB

> Les favoris restent désactivés jusqu'à l'ajout d'une persistance et d'un état utilisateur.

---

## Technologies

| Couche | Technologie |
|---|---|
| Framework | Astro 6 |
| Interface | React 19 |
| Styles | Tailwind CSS 4 |
| Composants | shadcn/ui + Radix UI |
| Métadonnées | API TMDB |
| Lecture | HLS.js, FFmpeg, ASS.js |
| Gestionnaire | pnpm |
| Déploiement | Vercel |

---

## Prérequis

- Node.js >= 22.12
- pnpm
- FFmpeg et FFprobe disponibles dans `PATH` pour le mode local
- Le dossier `F:\Peliculas` pour la bibliothèque locale

---

## Installation

```bash
git clone https://github.com/cristhobal/flick.git
cd flick
pnpm install
copy .env.example .env
pnpm dev
```

Dans `.env`, choisissez la source :

```dotenv
DATA_SOURCE=local
# ou
DATA_SOURCE=tmdb
```

---

## Modes de données

### TMDB

Le catalogue est chargé dans le navigateur. Le bouton de lecture n'est affiché que lorsqu'une véritable bande-annonce existe ; sinon, Flick présente uniquement les informations du titre.

Pour Vercel :

```dotenv
PUBLIC_DATA_SOURCE=tmdb
```

Activez cette variable pour Production, Preview et Development.

### Bibliothèque locale

Le mode local analyse `F:\Peliculas` et génère `public/movies.json`.

```text
F:\Peliculas\
├── Film (2024).mkv
├── Film (2024).fr.srt
├── series\
│   └── Nom de la série\
│       └── Season 1\
│           ├── S01E01.mkv
│           └── S01E02.mkv
└── animes\
    └── Nom de l'anime\
        ├── 01.mkv
        └── 02.mkv
```

Les routes de lecture locale exigent un accès à la machine hôte et ne sont pas disponibles dans un déploiement Vercel statique standard.

---

## Scripts

| Commande | Description |
|---|---|
| `pnpm dev` | Analyse la bibliothèque si nécessaire et démarre Astro |
| `pnpm scan` | Génère le catalogue local |
| `pnpm build` | Construit l'application dans `dist` |
| `pnpm preview` | Prévisualise le build localement |
| `pnpm typecheck` | Lance les diagnostics Astro et TypeScript |
| `pnpm lint` | Lance ESLint |
| `pnpm format` | Formate les fichiers du projet |

---

## Déploiement

1. Importez le dépôt dans Vercel.
2. Conservez Astro comme framework.
3. Ajoutez `PUBLIC_DATA_SOURCE=tmdb`.
4. Déployez avec la configuration `vercel.json`.

La commande de build est `astro build` et le dossier de sortie est `dist`.

---

## Développement

```bash
pnpm install
pnpm typecheck
pnpm build
```

---

## Avertissement

Flick est une interface multimédia personnelle. Les métadonnées et images sont fournies par TMDB. Le projet n'est ni approuvé ni certifié par TMDB. Chaque utilisateur est responsable des médias qu'il héberge et lit localement.