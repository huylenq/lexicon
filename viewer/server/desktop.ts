import { writeFile, rename, unlink, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
// The desktop parent supplies data paths and a per-launch API secret before imports run.
import config from "./index";
import { chat } from "./chat/service";
import { stopOwnedAgents } from "./chat/process";
import { db } from "./db";

if (!process.env.LEXICON_DESKTOP_TOKEN || !process.env.LEXICON_VIEWER_DB)
  throw new Error("Desktop backend requires its launcher.");
const server = Bun.serve({ ...config, port: 0 });
const connectionFile = join(dirname(process.env.LEXICON_VIEWER_DB), "agent-connection.json");
const connection = JSON.stringify({ version: 1, origin: `http://127.0.0.1:${server.port}`, token: process.env.LEXICON_DESKTOP_TOKEN });
const temporary = `${connectionFile}.${process.pid}.tmp`;
await writeFile(temporary, connection, { mode: 0o600, flag: "wx" });
await rename(temporary, connectionFile);
console.log(JSON.stringify({ type: "lexicon-ready", port: server.port }));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.stop(true);
  chat.stopAll();
  await stopOwnedAgents();
  try { if (await readFile(connectionFile, "utf8") === connection) await unlink(connectionFile); } catch {}
  db.close();
  process.exit(0);
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
// A closed parent pipe also shuts down the backend after a launcher crash.
process.stdin.resume();
process.stdin.once("end", () => void stop());
