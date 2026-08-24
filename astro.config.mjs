// @ts-check

import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import { localMediaDevPlugin } from "./scripts/local-media-server.mjs"

// jassub (WASM libass, used for ASS/SSA subtitle styling in the local dev player)
// constructs an internal Worker in a way Rollup's production code-splitting can't
// bundle ("IIFE not supported"), which would fail `astro build` even though that
// code path is local-dev-only and never reached in production. Swap ass-renderer.ts
// for a no-op stub with the same exports during the build so Rollup never has to
// resolve jassub at all — dev keeps the real implementation untouched.
function assRendererProdStubPlugin() {
  let isBuild = false
  const stubPath = fileURLToPath(new URL("./src/lib/ass-renderer.prod-stub.ts", import.meta.url))
  return {
    name: "flick-ass-renderer-prod-stub",
    configResolved(/** @type {{ command: string }} */ config) {
      isBuild = config.command === "build"
    },
    resolveId(/** @type {string} */ source) {
      if (!isBuild) return null
      if (/\/lib\/ass-renderer(\.ts)?$/.test(source) && !source.includes("prod-stub")) {
        return stubPath
      }
      return null
    },
  }
}

// In production, vercel.json rewrites every non-asset path to `/` so a hard refresh
// or direct link on a client-only route (e.g. /watch/series/...) still boots the SPA
// shell instead of a host-level 404. `astro dev` has no such rewrite in front of it —
// this mirrors it for local dev only, since output: "static" has no adapter/SSR
// route to serve those paths itself.
function spaFallbackDevPlugin() {
  /** @type {import("vite").Plugin} */
  const plugin = {
    name: "flick-spa-fallback-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next()
        const url = req.url || ""
        if (
          url.startsWith("/api/") ||
          url.startsWith("/@") ||
          url.startsWith("/src/") ||
          url.startsWith("/node_modules/") ||
          url.startsWith("/.well-known/")
        ) {
          return next()
        }
        // A real static file (asset, favicon, source map, ...) — leave it to Vite.
        if (/\.[a-zA-Z0-9]+($|\?)/.test(url)) return next()
        req.url = "/"
        next()
      })
    },
  }
  return plugin
}

export default defineConfig({
  output: "static",
  vite: {
    // localMediaDevPlugin and spaFallbackDevPlugin both use apply: "serve", so they
    // only attach to `astro dev` and are fully absent from `astro build` / prod.
    plugins: [tailwindcss(), localMediaDevPlugin(), assRendererProdStubPlugin(), spaFallbackDevPlugin()],
  },
  integrations: [react()],
})
