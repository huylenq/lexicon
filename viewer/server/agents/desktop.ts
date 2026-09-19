import net from "node:net";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

export interface DesktopThread { environmentId: string; threadId: string }
export function desktopControlAddress(stateDir: string) {
  const hash = createHash("sha256").update(resolve(stateDir)).digest("hex").slice(0, 24);
  return join(tmpdir(), `t3code-${process.getuid!()}`, `${hash}.sock`);
}

/** Same acknowledged open-thread protocol used by Rooms; no task execution is requested. */
export function requestDesktopThread(address: string, target: DesktopThread, { signal, timeout = 16_000 }: { signal?: AbortSignal; timeout?: number } = {}) {
  signal?.throwIfAborted();
  const request = { version: 1, requestId: randomUUID(), type: "open-thread", ...target };
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(address);
    let buffer = "", done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); socket.destroy();
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new Error("Opening T3 Code was cancelled."));
    const timer = setTimeout(() => finish(new Error("T3 Code did not acknowledge the requested thread.")), timeout);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("error", finish);
    socket.on("end", () => finish(new Error("T3 Code closed the request without opening the thread.")));
    socket.on("data", chunk => {
      buffer += chunk;
      if (buffer.length > 65_536) return finish(new Error("Invalid T3 Code acknowledgement."));
      if (!buffer.includes("\n")) return;
      try {
        const response = JSON.parse(buffer.slice(0, buffer.indexOf("\n")));
        if (response.version !== 1 || response.requestId !== request.requestId) throw new Error("Invalid T3 Code acknowledgement.");
        if (!response.ok) throw new Error(response.message || "T3 Code could not open this environment and thread.");
        if (response.threadId !== target.threadId) throw new Error("T3 Code opened a different thread.");
        finish();
      } catch (error) { finish(error as Error); }
    });
  });
}

export async function openDesktopThread(target: DesktopThread, signal?: AbortSignal) {
  if (process.platform !== "darwin") throw new Error("Open in T3 Code currently requires macOS.");
  const stateDir = process.env.LEXICON_T3_STATE_DIR || join(homedir(), ".t3/dev");
  const appPath = process.env.LEXICON_T3_APP_PATH || join(homedir(), "src/t3code/apps/desktop/.electron-runtime/T3 Code (Dev).app");
  const address = desktopControlAddress(stateDir);
  await promisify(execFile)("/usr/bin/open", ["-a", appPath], { timeout: 10_000, signal });
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { await requestDesktopThread(address, target, { signal }); return; }
    catch (error) {
      if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
      if (Date.now() >= deadline) throw new Error("T3 Code desktop is unavailable. Check LEXICON_T3_APP_PATH and LEXICON_T3_STATE_DIR.");
      await delay(200, undefined, { signal });
    }
  }
}
