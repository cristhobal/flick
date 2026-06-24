<div align="center">

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/flick-Personal%20Streaming%20Platform-FAFAFA?style=for-the-badge&logo=astro&logoColor=080808&labelColor=FAFAFA">
  <img alt="flick" src="https://img.shields.io/badge/flick-Personal%20Streaming%20Platform-080808?style=for-the-badge&logo=astro&logoColor=FAFAFA&labelColor=080808">
</picture>

<br />
<br />

**स्थानीय मीडिया लाइब्रेरी और [TMDB](https://www.themoviedb.org/) खोज के लिए एक निजी स्ट्रीमिंग इंटरफ़ेस।**
Astro और React पर बने आधुनिक अनुभव में फ़िल्में, सीरीज़ और ऐनिमे ब्राउज़ करें।

<br />

[![Astro](https://img.shields.io/badge/Astro-6-080808?style=flat-square&logo=astro&logoColor=FAFAFA)](https://astro.build)
[![React](https://img.shields.io/badge/React-19-080808?style=flat-square&logo=react&logoColor=FAFAFA)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-080808?style=flat-square&logo=node.js&logoColor=FAFAFA)](https://nodejs.org)
[![Vercel](https://img.shields.io/badge/Vercel-live-080808?style=flat-square&logo=vercel&logoColor=FAFAFA)](https://withflick.vercel.app/)

<br />

[English](../README.md) · [中文](zh.md) · [हिन्दी](hi.md) · [Español](es.md) · [Français](fr.md)

<br />

**🌐 [लाइव डिप्लॉयमेंट](https://withflick.vercel.app/) — TMDB कैटलॉग और responsive इंटरफ़ेस**

<br />

</div>

---

## परिचय

**Flick** एक ही इंटरफ़ेस में दो डेटा स्रोत देता है:

- **TMDB मोड:** कैटलॉग, खोज, मेटाडेटा, कलाकार, चित्र और उपलब्ध YouTube ट्रेलर।
- **लोकल मोड:** `F:\Peliculas` में रखी फ़िल्में, सीरीज़, ऐनिमे, ऑडियो ट्रैक और सबटाइटल स्कैन तथा प्ले करना।

Astro स्थिर एप्लिकेशन बनाता है और React नेविगेशन, फ़िल्टर, विवरण पेज तथा प्लेयर संभालता है।

---

## मुख्य सुविधाएँ

- घूर्णन hero और कैटलॉग carousels वाला responsive होम पेज
- फ़िल्म, सीरीज़ और ऐनिमे के लिए खोज, फ़िल्टर और sorting
- TMDB पोस्टर, backdrop, genre, rating, cast और trailer
- `public/movies.json` बनाने वाला लोकल लाइब्रेरी scanner
- MP4, MKV, AVI, MOV, WMV, FLV, WebM और M4V playback
- FFmpeg के माध्यम से HLS generation
- SRT, VTT, ASS और SSA बाहरी या embedded subtitles
- embedded audio tracks की पहचान और भाषा चयन
- TMDB मोड के लिए Vercel static deployment

> Favorites सुविधा अभी निष्क्रिय है; persistence और user state बाद में जोड़े जाएंगे।

---

## तकनीक

| स्तर | तकनीक |
|---|---|
| Framework | Astro 6 |
| UI | React 19 |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui + Radix UI |
| Metadata | TMDB API |
| Playback | HLS.js, FFmpeg, ASS.js |
| Package manager | pnpm |
| Deployment | Vercel |

---

## आवश्यकताएँ

- Node.js >= 22.12
- pnpm
- लोकल मोड के लिए `PATH` में FFmpeg और FFprobe
- लोकल लाइब्रेरी के लिए `F:\Peliculas` फ़ोल्डर

---

## इंस्टॉलेशन

```bash
git clone https://github.com/cristhobal/flick.git
cd flick
pnpm install
copy .env.example .env
pnpm dev
```

`.env` में डेटा स्रोत चुनें:

```dotenv
DATA_SOURCE=local
# या
DATA_SOURCE=tmdb
```

---

## डेटा मोड

### TMDB

कैटलॉग ब्राउज़र में लोड होता है। यदि वास्तविक ट्रेलर उपलब्ध है तभी **Reproducir** बटन दिखता है; ट्रेलर न होने पर केवल शीर्षक की जानकारी दिखाई जाती है।

Vercel में सेट करें:

```dotenv
PUBLIC_DATA_SOURCE=tmdb
```

इसे Production, Preview और Development तीनों में सक्षम करें।

### लोकल लाइब्रेरी

लोकल मोड `F:\Peliculas` स्कैन करके `public/movies.json` बनाता है।

```text
F:\Peliculas\
├── Movie (2024).mkv
├── Movie (2024).hi.srt
├── series\Series Name\Season 1\S01E01.mkv
└── animes\Anime Name\01.mkv
```

लोकल playback routes को host machine की फ़ाइलों तक पहुँच चाहिए, इसलिए वे सामान्य static Vercel deployment में उपलब्ध नहीं होते।

---

## स्क्रिप्ट

| कमांड | विवरण |
|---|---|
| `pnpm dev` | आवश्यकता होने पर लाइब्रेरी स्कैन करके Astro शुरू करता है |
| `pnpm scan` | लोकल कैटलॉग बनाता है |
| `pnpm build` | `dist` में production build बनाता है |
| `pnpm preview` | build का local preview |
| `pnpm typecheck` | Astro और TypeScript diagnostics |
| `pnpm lint` | ESLint चलाता है |

---

## डिप्लॉयमेंट

1. GitHub repository को Vercel में import करें।
2. Astro framework बनाए रखें।
3. `PUBLIC_DATA_SOURCE=tmdb` जोड़ें।
4. मौजूदा `vercel.json` के साथ deploy करें।

---

## विकास

```bash
pnpm install
pnpm typecheck
pnpm build
```

---

## अस्वीकरण

Flick एक निजी मीडिया इंटरफ़ेस है। मेटाडेटा और चित्र TMDB से आते हैं। यह प्रोजेक्ट TMDB द्वारा समर्थित या प्रमाणित नहीं है। स्थानीय रूप से होस्ट और चलाए जाने वाले मीडिया की ज़िम्मेदारी उपयोगकर्ता की है।