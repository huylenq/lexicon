import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const apiPort = process.env.LEXICON_VIEWER_API_PORT || "5394";
const clientPort = process.env.LEXICON_CANVAS_PORT || "5393";
const env = { ...process.env, LEXICON_VIEWER_API_PORT: apiPort, LEXICON_CANVAS_PROTOTYPE: "1",
  LEXICON_VIEWER_DB: process.env.LEXICON_VIEWER_DB || resolve(root, "lexicon-canvas-prototype.db") };
const processes = [
  Bun.spawn(["bun", "run", "server/index.ts"], { cwd: root, env, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "x", "vite", "--config", "client/vite.config.ts", "--port", clientPort, "--strictPort"], { cwd: root, env, stdout: "inherit", stderr: "inherit" }),
];
const stop = () => processes.forEach((process) => process.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(`Canvas prototype: http://127.0.0.1:${clientPort}/p/canvas-workshop?canvas=tldraw`);
const exitCode = await Promise.race(processes.map((process) => process.exited));
stop();
process.exit(exitCode);
