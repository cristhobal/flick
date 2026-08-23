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

export default defineConfig({
  output: "static",
  vite: {
    // localMediaDevPlugin uses apply: "serve", so it only attaches to `astro dev`
    // and is fully absent from `astro build` / the production bundle.
    plugins: [tailwindcss(), localMediaDevPlugin(), assRendererProdStubPlugin()],
  },
  integrations: [react()],
})
