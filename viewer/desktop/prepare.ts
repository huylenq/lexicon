import { cp, mkdir, rm, chmod } from "node:fs/promises";
import { resolve, join } from "node:path";

// Build on the target architecture: Bun and Tree-sitter are native binaries.
if (process.platform !== "darwin") throw new Error("Desktop packaging currently supports macOS.");
const desktop = import.meta.dir;
const viewer = resolve(desktop, "..");
const stage = join(desktop, "stage");
async function run(cmd: string[], cwd: string) {
  const child = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error(`Failed: ${cmd.join(" ")}`);
}
await run([process.execPath, "run", "build:client"], viewer);
await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, "viewer/client"), { recursive: true });
await mkdir(join(stage, "bin"), { recursive: true });
await cp(process.execPath, join(stage, "bin/bun"));
await chmod(join(stage, "bin/bun"), 0o755);
for (const name of ["server", "shared", "package.json", "bun.lock"])
  await cp(join(viewer, name), join(stage, "viewer", name), { recursive: true });
await cp(join(viewer, "client/dist"), join(stage, "viewer/client/dist"), { recursive: true });
await mkdir(join(stage, "viewer/examples/dentalml/lexicon"), { recursive: true });
await cp(join(viewer, "examples/dentalml/lexicon/model.xml"), join(stage, "viewer/examples/dentalml/lexicon/model.xml"));
await cp(resolve(viewer, "../skills/lexicon"), join(stage, "skills/lexicon"), { recursive: true });
await run([process.execPath, "install", "--production", "--frozen-lockfile"], join(stage, "viewer"));
// Fail packaging if native symbol resolution silently fell back to file-only mode.
await run([process.execPath, "-e", 'import { getParser } from "./server/grammars.ts"; for (const g of ["ts", "tsx", "py"]) { if (!getParser(g)) throw new Error(`Missing grammar: ${g}`); }'], join(stage, "viewer"));
console.log(`Prepared macOS ${process.arch} backend in ${stage}`);
