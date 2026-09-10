// The desktop parent supplies data paths and a per-launch API secret before imports run.
import config from "./index";
import { chat } from "./chat/service";
import { stopOwnedAgents } from "./chat/process";
import { db } from "./db";

if (!process.env.LEXICON_DESKTOP_TOKEN || !process.env.LEXICON_VIEWER_DB)
  throw new Error("Desktop backend requires its launcher.");
const server = Bun.serve({ ...config, port: 0 });
console.log(JSON.stringify({ type: "lexicon-ready", port: server.port }));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.stop(true);
  chat.stopAll();
  await stopOwnedAgents();
  db.close();
  process.exit(0);
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
// A closed parent pipe also shuts down the backend after a launcher crash.
process.stdin.resume();
process.stdin.once("end", () => void stop());
