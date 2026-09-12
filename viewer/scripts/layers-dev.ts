import { resolve } from "node:path";

const viewer = resolve(import.meta.dir, "..");
const apiPort = process.env.LEXICON_VIEWER_API_PORT || "5408";
const clientPort = process.env.LEXICON_LAYERS_PORT || "5407";
for (const port of [apiPort, clientPort]) {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: Number(port), socket: { data() {} } });
  probe.stop(true);
}
const env = { ...process.env, LEXICON_VIEWER_API_PORT: apiPort, LEXICON_VIEWER_DB: ":memory:" };
const children = [
  Bun.spawn(["bun", "run", "--hot", "server/index.ts"], { cwd: viewer, env, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "x", "vite", "--config", "client/vite.config.ts", "--port", clientPort, "--strictPort"], { cwd: viewer, env, stdout: "inherit", stderr: "inherit" }),
];
const stop = () => children.forEach(child => child.kill());
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
console.log(`Lexicon canvas: http://127.0.0.1:${clientPort}/p/shop?presentation=layers\nIsolated registry; layouts save to the selected project canvas.`);
try { process.exitCode = await Promise.race(children.map(child => child.exited)); }
finally { stop(); }
