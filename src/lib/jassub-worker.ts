// Worker entry for JASSUB (see ass-renderer.ts): JASSUB's own worker
// (dist/worker/worker.js), with one fix applied first — import order is evaluation
// order, so the patch is in place before any of JASSUB's code runs.
import "./jassub-worker-no-desync"
// eslint-disable-next-line import/no-unresolved
import "jassub/dist/worker/worker.js"
