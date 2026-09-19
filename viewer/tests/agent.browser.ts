import { openAgentConversation, prepareAgent } from "./fixtures/agent-ui";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ViewerSession } from "../shared/agent";

test.use({ serviceWorkers: "block" });

async function mcpCall(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const response = await request.post("/api/agent/mcp", {
    headers: { Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  expect(body.result.isError, JSON.stringify(body.result.content)).not.toBe(true);
  return body.result.structuredContent;
}

const xml = '<lexicon schema="3.3" id="voice"><name>Voice Trial</name><description>Agent integration trial.</description><context id="scope"><name>Ordering</name><description>Order management.</description><concept id="order"><name>Order</name><description>A purchase.</description><code-link kind="code" file="order.ts" symbol="Order" role="representation">Stores a purchase.</code-link></concept></context></lexicon>';

test("MCP creates and updates visible items, targets one viewer, observes selection, and undoes exact XML", async ({ page, context, request, baseURL }, testInfo) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-agent-browser-"));
  const client = new Client({ name: "lexicon-browser-acceptance", version: "1" });
  let projectId = "";
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "lexicon/model.xml"), xml);
    await writeFile(join(root, "order.ts"), "export interface Order { id: string }");
    projectId = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await client.connect(new StdioClientTransport({ command: "bun", args: [resolve("server/agent/mcp.ts")], env: { LEXICON_URL: baseURL! } }));
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).toContain("lexicon_navigate");
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name: `lexicon_${name}`, arguments: { projectId, ...args } });
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
      return JSON.parse((result.content as { text: string }[])[0].text);
    };
    await page.goto(`/p/${projectId}?item=order`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect.poll(async () => (await call("sessions")).sessions.filter((s: ViewerSession) => s.connected).length).toBe(1);
    const first = (await call("sessions")).sessions[0] as ViewerSession;
    expect(first.selection).toEqual({ kind: "item", id: "order" });
    const other = await context.newPage();
    await other.goto(`/p/${projectId}?item=scope`);
    await expect.poll(async () => (await call("sessions")).sessions.filter((s: ViewerSession) => s.connected).length).toBe(2);
    const second = (await call("sessions")).sessions.find((s: ViewerSession) => s.id !== first.id) as ViewerSession;
    const initial = await call("inspect");
    const created = await call("edit", { revision: initial.revision, action: "create", item: { type: "concept", id: "refund", parent: "scope", name: "Refund", description: "A returned payment." } });
    const relation = await call("edit", { revision: created.revision, action: "create", item: { type: "relationship", id: "refunded", from: "refund", to: "order", name: "refunds", description: "Returns the purchase payment." } });
    const updated = await call("edit", { revision: relation.revision, action: "update", itemId: "refund", fields: { name: "Payment Refund", description: "Returns money for an accepted purchase." } });
    await expect(page.locator('[data-model-id="item:refund"]')).toContainText("Payment Refund");
    await expect(other.locator('[data-model-id="item:refund"]')).toContainText("Payment Refund");
    const sessionsAfterEdit = (await call("sessions")).sessions as ViewerSession[];
    expect(sessionsAfterEdit.find(s => s.id === second.id)?.selection).toEqual({ kind: "item", id: "scope" });
    const active = page.locator("main [data-reader-card].active");
    const anchor = page.locator('[data-model-id="item:order"]');
    const cameraBefore = await anchor.boundingBox();
    await call("navigate", { sessionId: first.id, action: "select", itemId: "refund" });
    await expect(active.locator("h1")).toHaveText("Payment Refund");
    await expect(active).toContainText("Returns money for an accepted purchase.");
    const cameraAfter = await anchor.boundingBox();
    expect(Math.abs(cameraAfter!.x - cameraBefore!.x)).toBeLessThan(1);
    expect(Math.abs(cameraAfter!.width - cameraBefore!.width)).toBeLessThan(1);
    const focused = await call("navigate", { sessionId: first.id, action: "focus", itemId: "refund" });
    expect(focused.session.view).toBe("canvas");
    await expect(page.locator('[data-model-id="item:refund"]')).toBeInViewport();
    const cursor = (await call("events")).cursor;
    await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
    await expect.poll(async () => ((await call("sessions")).sessions as ViewerSession[]).find(s => s.id === first.id)?.selection).toEqual({ kind: "item", id: "order" });
    expect((await call("events", { cursor })).events.some((e: { type: string }) => e.type === "session.changed")).toBe(true);
    await call("navigate", { sessionId: first.id, action: "fit" });
    await page.screenshot({ path: testInfo.outputPath("agent-desktop.png") });
    await page.setViewportSize({ width: 430, height: 900 });
    await call("navigate", { sessionId: first.id, action: "focus", itemId: "refund" });
    await expect(page.locator('[data-model-id="item:refund"]')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(430);
    await page.screenshot({ path: testInfo.outputPath("agent-mobile.png") });
    const closedId = second.id;
    await other.goto("/");
    await expect.poll(async () => ((await call("sessions")).sessions as ViewerSession[]).some(s => s.id === closedId)).toBe(false);
    const unavailable = await client.callTool({ name: "lexicon_navigate", arguments: { projectId, sessionId: closedId, action: "fit" } });
    expect(unavailable.isError).toBe(true);
    for (const receipt of [updated, relation, created]) await call("undo", { changeId: receipt.changeId });
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
    await expect(page.locator('[data-model-id="item:refund"]')).toHaveAttribute("data-missing", "true");
    // External file changes also reach a connected viewer without a manual refresh.
    await writeFile(join(root, "lexicon/model.xml"), xml.replace("A purchase.", "A purchase observed on disk."));
    await expect.poll(async () => ((await call("sessions")).sessions as ViewerSession[]).find(s => s.id === first.id)?.modelRevision).not.toBe(initial.revision);
    // A server-expired session recovers on the next heartbeat/state report.
    await request.delete(`/api/agent/projects/${projectId}/sessions/${first.id}`);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
    await expect.poll(async () => (await call("sessions")).sessions.filter((s: ViewerSession) => s.connected && s.id !== first.id).length).toBe(1);
    const recovered = (await call("sessions")).sessions[0] as ViewerSession;
    await call("navigate", { sessionId: recovered.id, action: "select", itemId: "order" });
    await expect(active).toContainText("A purchase observed on disk.");
    expect(errors).toEqual([]);
  } finally {
    await client.close();
    await page.goto("/");
    if (projectId) await request.delete(`/api/projects/${projectId}`);
    await rm(root, { recursive: true, force: true });
  }
});


test("code-capable chat targets its originating tab while standalone MCP retains exact undo", async ({ page, context, request, baseURL }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-embedded-browser-"));
  const client = new Client({ name: "lexicon-embedded-acceptance", version: "1" });
  let projectId = "";
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "lexicon/model.xml"), xml);
    await writeFile(join(root, "order.ts"), "export interface Order { id: string }");
    projectId = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await client.connect(new StdioClientTransport({ command: "bun", args: [resolve("server/agent/mcp.ts")], env: { LEXICON_URL: baseURL! } }));
    await page.goto(`/p/${projectId}?item=order`);
    const other = await context.newPage();
    await other.goto(`/p/${projectId}?item=scope`);
    await (await prepareAgent(page)).click();
    await openAgentConversation(page);
    const chat = page.locator("#chat-pane");
    await expect(chat.getByRole("combobox", { name: "Agent model" })).toBeEnabled();
    await chat.getByLabel("Editing scope").selectOption("code");
    const send = async (calls: unknown) => {
      await chat.getByRole("textbox", { name: "Message the agent" }).fill("APPLICATION TRIAL " + JSON.stringify(calls));
      await chat.getByRole("button", { name: "Send", exact: true }).click();
      await expect(chat.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    };
    await expect.poll(async () => {
      return (await mcpCall(request, "lexicon_sessions", { projectId })).sessions.filter((s: ViewerSession) => s.connected).length;
    }).toBe(2);
    await send([{ tool: "lexicon_edit", arguments: { action: "create", item: { type: "concept", id: "marker", parent: "scope", name: "Marker", description: "Temporary trial." } } }, { tool: "lexicon_navigate", arguments: { action: "focus", itemId: "marker" } }]);
    await expect(chat.getByText("Viewer confirmed: focus", { exact: true })).toBeVisible();
    await expect(page.locator("main [data-reader-card].active h1")).toHaveText("Marker");
    await expect(other.locator("main [data-reader-card].active h1")).toHaveText("Ordering");
    const afterCreate = await readFile(join(root, "lexicon/model.xml"), "utf8");
    await writeFile(join(root, "main.rs"), "fn main() {}");
    await send([{ tool: "lexicon_edit", arguments: { action: "update", itemId: "marker", fields: { name: "Updated Marker", codeLinks: [{ kind: "code", file: "main.rs", symbol: "main", role: "implementation", description: "Rust entry" }] } } }, { tool: "lexicon_navigate", arguments: { action: "select", itemId: "marker" } }, { tool: "lexicon_navigate", arguments: { action: "fit" } }]);
    await expect(chat.getByText("Viewer confirmed: fit", { exact: true })).toBeVisible();
    await expect(chat.getByText(/Symbol not checked: main\.rs#main\./)).toBeVisible();
    await expect(page.locator("main [data-reader-card].active h1")).toHaveText("Updated Marker");
    await expect(chat.getByRole("button", { name: /Undo/ })).toHaveCount(0);
    const state = await (await request.get(`/api/projects/${projectId}/model/history`)).json();
    // Standalone MCP still serves explicit model tooling outside the agent UI.
    for (const change of [...state.changes].reverse()) {
      if (!change.change) continue;
      const undone = await client.callTool({ name: "lexicon_undo", arguments: { projectId, changeId: change.id } });
      expect(undone.isError).not.toBe(true);
    }
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
    await other.close();
  } finally {
    await client.close();
    await page.goto("/");
    if (projectId) await request.delete(`/api/projects/${projectId}`);
    await rm(root, { recursive: true, force: true });
  }
});

test("Stop cancels navigation waiting for the viewer refresh", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-cancel-browser-"));
  let projectId = "";
  let release = () => {};
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "lexicon/model.xml"), xml);
    await writeFile(join(root, "order.ts"), "export interface Order { id: string }");
    projectId = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await page.goto(`/p/${projectId}?item=scope`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect.poll(async () => (await mcpCall(request, "lexicon_sessions", { projectId })).sessions.some((s: ViewerSession) => s.connected)).toBe(true);
    await (await prepareAgent(page)).click();
    await openAgentConversation(page);
    const chat = page.locator("#chat-pane");
    await expect(chat.getByRole("combobox", { name: "Agent model" })).toBeEnabled();
    let blocked!: () => void;
    const reached = new Promise<void>(resolve => { blocked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/projects/${projectId}/model`, async route => {
      blocked();
      await gate;
      await route.continue();
    });
    await chat.getByRole("textbox", { name: "Message the agent" }).fill('APPLICATION TRIAL [{"tool":"lexicon_navigate","arguments":{"action":"focus","itemId":"order"}}]');
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await reached;
    await chat.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(chat.locator(".chat-error")).toContainText("Navigation cancelled");
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(page.locator("main [data-reader-card].active h1")).toHaveText("Ordering");
    await expect(chat.getByText("Viewer confirmed: focus", { exact: true })).toHaveCount(0);
    const state = await (await request.get(`/api/projects/${projectId}/model/history`)).json();
    await expect(chat.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await page.goto("/");
    if (projectId) await request.delete(`/api/projects/${projectId}`);
    await rm(root, { recursive: true, force: true });
  }
});
