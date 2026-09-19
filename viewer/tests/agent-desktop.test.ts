import { expect, test } from "bun:test";
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { desktopControlAddress, requestDesktopThread } from "../server/agents/desktop";

test("desktop activation uses a stable socket and requires acknowledgement for the exact thread", async () => {
  expect(desktopControlAddress("/tmp/t3-state")).toBe(desktopControlAddress("/tmp/t3-state/"));
  const root = await mkdtemp(join(tmpdir(), "lexicon-t3-open-")), address = join(root, "test.sock");
  let mode = "success";
  const requests: unknown[] = [];
  const server = net.createServer(socket => socket.once("data", data => {
    const request = JSON.parse(data.toString()); requests.push(request);
    socket.end(JSON.stringify({ version: 1, requestId: mode === "wrong-request" ? "other" : request.requestId,
      ok: mode !== "missing-env", threadId: mode === "wrong-thread" ? "other" : request.threadId,
      message: "Environment unavailable" }) + "\n");
  }));
  await new Promise<void>(resolve => server.listen(address, resolve));
  try {
    const target = { environmentId: "paired-environment", threadId: "selected-thread" };
    await requestDesktopThread(address, target);
    expect(requests[0]).toMatchObject({ version: 1, type: "open-thread", ...target });
    mode = "wrong-thread"; await expect(requestDesktopThread(address, target)).rejects.toThrow("different thread");
    mode = "wrong-request"; await expect(requestDesktopThread(address, target)).rejects.toThrow("Invalid");
    mode = "missing-env"; await expect(requestDesktopThread(address, target)).rejects.toThrow("Environment unavailable");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("cancelling desktop activation closes the request", async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-t3-cancel-")), address = join(root, "test.sock");
  const controller = new AbortController();
  const server = net.createServer(socket => socket.once("data", () => controller.abort()));
  await new Promise<void>(resolve => server.listen(address, resolve));
  try { await expect(requestDesktopThread(address, { environmentId: "env", threadId: "thread" }, { signal: controller.signal })).rejects.toThrow("cancelled"); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
