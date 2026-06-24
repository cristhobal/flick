<div align="center">

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/flick-Personal%20Streaming%20Platform-FAFAFA?style=for-the-badge&logo=astro&logoColor=080808&labelColor=FAFAFA">
  <img alt="flick" src="https://img.shields.io/badge/flick-Personal%20Streaming%20Platform-080808?style=for-the-badge&logo=astro&logoColor=FAFAFA&labelColor=080808">
</picture>

<br />
<br />

**面向本地媒体库与 [TMDB](https://www.themoviedb.org/) 内容发现的个人流媒体界面。**
通过 Astro + React 构建的现代体验浏览电影、剧集和动画。

<br />

[![Astro](https://img.shields.io/badge/Astro-6-080808?style=flat-square&logo=astro&logoColor=FAFAFA)](https://astro.build)
[![React](https://img.shields.io/badge/React-19-080808?style=flat-square&logo=react&logoColor=FAFAFA)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-080808?style=flat-square&logo=node.js&logoColor=FAFAFA)](https://nodejs.org)
[![Vercel](https://img.shields.io/badge/Vercel-live-080808?style=flat-square&logo=vercel&logoColor=FAFAFA)](https://withflick.vercel.app/)

<br />

[English](../README.md) · [中文](zh.md) · [हिन्दी](hi.md) · [Español](es.md) · [Français](fr.md)

<br />

**🌐 [在线部署](https://withflick.vercel.app/) — TMDB 目录与响应式界面**

<br />

</div>

---

## 概述

**Flick** 在同一界面中提供两种数据来源：

- **TMDB 模式：**目录、搜索、元数据、演员、图片以及可用的 YouTube 预告片。
- **本地模式：**扫描并播放 `F:\Peliculas` 中的电影、剧集、动画、音轨与字幕。

Astro 负责静态构建，React 负责导航、筛选、详情页面与播放器状态。

---

## 功能

- 带轮播主视觉和横向内容列表的响应式首页
- 电影、剧集和动画分类，支持搜索、筛选与排序
- TMDB 海报、背景图、类型、评分、演员和预告片
- 生成 `public/movies.json` 的本地媒体扫描器
- 支持 MP4、MKV、AVI、MOV、WMV、FLV、WebM 和 M4V
- 使用 FFmpeg 生成 HLS 流
- 支持 SRT、VTT、ASS、SSA 外部及内嵌字幕
- 检测内嵌音轨并选择语言
- TMDB 模式可静态部署到 Vercel

> 收藏功能目前显示为禁用状态，等待持久化和用户状态功能完成。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 框架 | Astro 6 |
| 界面 | React 19 |
| 样式 | Tailwind CSS 4 |
| 组件 | shadcn/ui + Radix UI |
| 元数据 | TMDB API |
| 播放 | HLS.js、FFmpeg、ASS.js |
| 包管理器 | pnpm |
| 部署 | Vercel |

---

## 环境要求

- Node.js >= 22.12
- pnpm
- 本地模式需要在 `PATH` 中提供 FFmpeg 和 FFprobe
- 本地媒体库目录 `F:\Peliculas`

---

## 安装

```bash
git clone https://github.com/cristhobal/flick.git
cd flick
pnpm install
copy .env.example .env
pnpm dev
```

在 `.env` 中选择数据源：

```dotenv
DATA_SOURCE=local
# 或
DATA_SOURCE=tmdb
```

---

## 数据模式

### TMDB

目录直接在浏览器中加载。只有存在真实预告片时才显示播放按钮；没有预告片时，Flick 仅展示标题信息，不打开空播放器。

Vercel 环境变量：

```dotenv
PUBLIC_DATA_SOURCE=tmdb
```

请为 Production、Preview 和 Development 环境启用该变量。

### 本地媒体库

本地模式扫描 `F:\Peliculas` 并生成 `public/movies.json`。

```text
F:\Peliculas\
├── Movie (2024).mkv
├── Movie (2024).zh.srt
├── series\Series Name\Season 1\S01E01.mkv
└── animes\Anime Name\01.mkv
```

本地播放路由必须访问宿主机文件，因此无法在普通的 Vercel 静态部署中使用。

---

## 脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 必要时扫描媒体库并启动 Astro |
| `pnpm scan` | 生成本地目录数据 |
| `pnpm build` | 在 `dist` 中创建生产构建 |
| `pnpm preview` | 本地预览生产构建 |
| `pnpm typecheck` | 运行 Astro 与 TypeScript 检查 |
| `pnpm lint` | 运行 ESLint |
| `pnpm format` | 格式化项目文件 |

---

## 部署

1. 将 GitHub 仓库导入 Vercel。
2. 保持 Astro 框架设置。
3. 添加 `PUBLIC_DATA_SOURCE=tmdb`。
4. 使用现有 `vercel.json` 部署。

构建命令为 `astro build`，输出目录为 `dist`。

---

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
```

---

## 声明

Flick 是个人媒体界面。元数据和图片由 TMDB 提供。本项目未获得 TMDB 的认可或认证。用户应对其本地托管和播放的媒体负责。