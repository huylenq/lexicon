// elkjs bundled.js auto-detects its runtime: if `self` is defined it assumes
// it's inside a Web Worker and skips the module.exports branch. Bun exposes
// `self` globally (it points at globalThis) which fools that check, leaving
// `Worker` undefined and ELK construction crashes.
//
// Hide `self` from elkjs before it loads. Import this module BEFORE anything
// that pulls elkjs in transitively.
const g = globalThis as Record<string, unknown>;
if (typeof g.document === "undefined" && typeof g.self !== "undefined") {
  delete g.self;
}
