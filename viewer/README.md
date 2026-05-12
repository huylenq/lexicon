# lexicon-viewer

Local dev tool for browsing a lexicon-conform project (cold-layer YAML + codebase) in the browser. Editorial-meets-blueprint UI with Light Table-style Monaco code peeks.

```
bun install
bun dev          # http://localhost:5173
```

The dev script runs Bun (API on :8787) and Vite (client on :5173 proxying /api → :8787) together.
