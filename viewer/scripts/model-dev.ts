import { cp, mkdir, access, realpath } from "node:fs/promises";
import { resolve } from "node:path";

const viewer = resolve(import.meta.dir, "..");
// Retain the existing workshop data path so saved models, canvases, and chats survive.
const data = resolve(viewer, ".model-prototype");
const project = resolve(data, "shop");
const apiPort = process.env.LEXICON_VIEWER_API_PORT || "5398";
const clientPort = process.env.LEXICON_MODEL_PORT || "5397";
// Fail before starting either process when a selected port is already occupied.
for (const port of [apiPort, clientPort]) {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: Number(port), socket: { data() {} } });
  probe.stop(true);
}
await mkdir(data, { recursive: true });
if (!await access(project).then(() => true, () => false))
  await cp(resolve(viewer, "examples/shop"), project, { recursive: true });
const env = { ...process.env, LEXICON_VIEWER_API_PORT: apiPort, LEXICON_VIEWER_DB: resolve(data, "registry.db") };
const processes = [
  Bun.spawn(["bun", "run", "--hot", "server/index.ts"], { cwd: viewer, env, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "x", "vite", "--config", "client/vite.config.ts", "--port", clientPort, "--strictPort"], { cwd: viewer, env, stdout: "inherit", stderr: "inherit" }),
];
const stop = () => processes.forEach(child => child.kill());
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
try {
  const api = `http://127.0.0.1:${apiPort}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(api + "/api/health").then(r => r.ok, () => false)) { ready = true; break; }
    await Bun.sleep(100);
  }
  if (!ready) throw new Error("Model API did not start.");
  const registered = await (await fetch(api + "/api/projects")).json();
  const canonical = await realpath(project);
  let id = registered.find((item: { root: string }) => item.root === canonical)?.id;
  if (!id) {
    const response = await fetch(api + "/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: canonical }),
    });
    if (!response.ok) throw new Error(await response.text());
    id = (await response.json()).id;
  }
  console.log(`\nModel workshop: http://127.0.0.1:${clientPort}/p/${id}\nEditable fixture: ${project}/lexicon/model.xml\n`);
  process.exitCode = await Promise.race(processes.map(child => child.exited));
} finally {
  stop();
}
