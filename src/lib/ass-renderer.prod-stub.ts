// Production stand-in for ass-renderer.ts — astro.config.mjs swaps this in only
// during `astro build`. jassub (WASM libass) constructs an internal Worker in a way
// Rollup's production code-splitting can't bundle ("IIFE not supported"), which
// fails the whole build even though ASS rendering is a local-dev-only feature never
// reached in production. Keeping this file's exports identical to ass-renderer.ts
// lets LocalVideoPlayer.tsx stay untouched; only this one edge to jassub is cut.
export function useAssSubtitle(
  _videoRef: React.RefObject<HTMLVideoElement | null>,
  _subUrl: string | null,
  _fontUrls: string[]
): void {}
