import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("desktop backend authenticates API access and stops when its parent closes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "lexicon-desktop-server-"));
  const token = "test-desktop-session";
  const child = Bun.spawn([process.execPath, "run", "server/desktop.ts"], {
    cwd: join(import.meta.dir, ".."), stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env, LEXICON_DESKTOP_TOKEN: token, LEXICON_VIEWER_DB: join(temp, "registry.db") },
  });
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    const ready = JSON.parse(new TextDecoder().decode(first.value).trim());
    expect(ready.type).toBe("lexicon-ready");
    const connectionFile = join(temp, "agent-connection.json");
    const connection = JSON.parse(await readFile(connectionFile, "utf8"));
    expect(connection.token).toBe(token);
    expect(connection.origin).toBe(`http://127.0.0.1:${ready.port}`);
    expect((await stat(connectionFile)).mode & 0o777).toBe(0o600);
    const base = `http://127.0.0.1:${ready.port}`;
    const client = new Client({ name: "desktop-discovery-test", version: "1" });
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dir, "../server/agent/mcp.ts")], env: { LEXICON_CONNECTION_FILE: connectionFile } }));
      expect((await client.listTools()).tools.some(tool => tool.name === "lexicon_navigate")).toBe(true);
      expect((await client.callTool({ name: "lexicon_projects", arguments: {} })).isError).not.toBe(true);
    } finally { await client.close(); }
    expect((await fetch(`${base}/api/health`)).status).toBe(403);
    expect((await fetch(`${base}/api/health`, { headers: { "x-lexicon-desktop-token": "wrong" } })).status).toBe(403);
    const headers = { "x-lexicon-desktop-token": token };
    expect((await fetch(`${base}/api/health`, { headers })).status).toBe(200);
    expect((await fetch(`${base}/api/projects`, { headers: { ...headers, origin: "https://example.com" } })).status).toBe(403);
    child.stdin.end();
    expect(await child.exited).toBe(0);
    await expect(fetch(`${base}/api/health`)).rejects.toThrow();
  } finally {
    child.kill();
    await child.exited;
    await rm(temp, { recursive: true, force: true });
  }
}, 10000);
