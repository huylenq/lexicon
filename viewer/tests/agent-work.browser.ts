import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openAgentConversation, selectAgentOnCanvas } from "./fixtures/agent-ui";
import { workModelXml, workRequests } from "./fixtures/agent-work";
import type { AgentState } from "../shared/agent-runtime";

test.use({ serviceWorkers: "block" });

async function workshop(request: APIRequestContext) {
  const root = await mkdtemp(join(tmpdir(), "lexicon-draft-browser-"));
  await mkdir(join(root, "lexicon"));
  await writeFile(join(root, "lexicon/model.xml"), workModelXml);
  await writeFile(join(root, "order.ts"), "export interface Order { id: string; quantity: number }\n");
  await writeFile(join(root, "policy.ts"), "export function acceptOrder(quantity: number) { return quantity > 0; }\n");
  const project = await (await request.post("/api/projects", { data: { root } })).json();
  const created = await request.post(`/api/projects/${project.id}/agents`, { data: { name: "Clarify validation", contextIds: ["order", "policy"] } });
  expect(created.ok()).toBe(true);
  const agent = await created.json();
  const endpoint = (action: string) => `/api/projects/${project.id}/agent/${action}?agent=${agent.id}`;
  const state = async () => await (await request.get(endpoint("state"))).json() as AgentState;
  const xml = () => readFile(join(root, "lexicon/model.xml"), "utf8");
  const canvas = async () => (await (await request.get(`/api/projects/${project.id}/canvas`)).json()).document.snapshot.store;
  return { root, project, agent, state, xml, canvas, endpoint };
}

const perspective = (page: Page) => page.getByRole("group", { name: "Agent perspective", exact: true });
const footprint = (page: Page, kind: string, id: string) => page.locator(`[data-agent-footprint="${kind}"][data-item-id="${id}"]`);
const camera = (page: Page) => page.locator(".tl-html-layer.tl-shapes").getAttribute("style");

async function openCanvas(page: Page, id: string) {
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await selectAgentOnCanvas(page, "Clarify validation");
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
}

async function send(page: Page, text: string, running = false) {
  await openAgentConversation(page);
  const pane = page.locator("#chat-pane");
  await expect(pane.getByLabel("Agent model")).not.toHaveValue("");
  await pane.getByLabel("Message the agent").fill(text);
  const response = page.waitForResponse(response => response.url().includes("/agent/send?") && response.request().method() === "POST");
  await pane.getByRole("button", { name: "Send", exact: true }).click();
  expect((await response).ok()).toBe(true);
  if (running) await expect(pane.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  else await expect(pane.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await pane.getByRole("button", { name: "Minimize agent", exact: true }).click();
  await expect(perspective(page)).toBeVisible();
}

async function inspect(page: Page, id: string, name: string) {
  const before = await camera(page);
  await footprint(page, "draft", id).getByRole("button").click();
  const detail = page.getByRole("dialog", { name: `${name} change details`, exact: true });
  await expect(detail).toBeVisible();
  await expect(page.locator("#chat-pane")).toBeHidden();
  expect(await camera(page)).toBe(before);
  return detail;
}

async function dispose(page: Page, request: APIRequestContext, f: Awaited<ReturnType<typeof workshop>>) {
  await page.goto("/").catch(() => {});
  await request.delete(`/api/projects/${f.project.id}`).catch(() => {});
  await rm(f.root, { recursive: true, force: true });
}

test("candidate ghosts keep their canvas slots through cumulative draft refinements", async ({ page, request }) => {
  const f = await workshop(request);
  try {
    await openCanvas(page, f.project.id);
    const savedCanvas = await f.canvas(), savedCamera = await camera(page);
    let savedModelReads = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === `/api/projects/${f.project.id}/model`) savedModelReads++; });
    const candidate = (id: string) => ({ id, type: "concept", parent: "ordering", name: id,
      description: "A proposed ordering concept.", annotations: [], codeLinks: [] });
    const refine = async (upsert: ReturnType<typeof candidate>[], remove: string[] = []) => {
      const current = await (await request.get(`/api/projects/${f.project.id}/model`)).json();
      const previous = (await f.state()).work?.draft?.id;
      const result = await request.post(f.endpoint("send"), { data: { text: "APPLICATION TRIAL " + JSON.stringify([
        { tool: "lexicon_patch", arguments: { patch: { upsert, remove } } },
      ]), instanceId: "codex", model: "test-model", modelRevision: current.modelRevision } });
      expect(result.ok()).toBe(true);
      await expect.poll(async () => (await f.state()).running).toBe(false);
      await expect.poll(async () => (await f.state()).work?.draft?.id).not.toBe(previous);
    };
    await refine([candidate("zeta")]);
    const zeta = footprint(page, "draft", "zeta");
    await expect(zeta).toBeVisible();
    const zetaBefore = await zeta.boundingBox();
    await page.evaluate(() => {
      const rect = () => {
        const element = document.querySelector('[data-agent-footprint="draft"][data-item-id="zeta"]');
        const value = element?.getBoundingClientRect();
        return value && element?.getClientRects().length ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
      };
      const probe = { initial: rect(), changes: [] as unknown[], frames: 0, frame: 0 };
      const sample = () => {
        const current = rect(); probe.frames++;
        if (JSON.stringify(current) !== JSON.stringify(probe.initial) && probe.changes.length < 5) probe.changes.push(current);
        probe.frame = requestAnimationFrame(sample);
      };
      probe.frame = requestAnimationFrame(sample);
      (window as unknown as { ghostProbe: typeof probe }).ghostProbe = probe;
    });
    await refine([candidate("alpha")]);
    const alpha = footprint(page, "draft", "alpha");
    await expect(alpha).toBeVisible();
    expect(await zeta.boundingBox()).toEqual(zetaBefore);
    const alphaBefore = await alpha.boundingBox();
    await refine([candidate("beta")], ["alpha"]);
    await expect(alpha).toHaveCount(0);
    await expect(footprint(page, "draft", "beta")).toBeVisible();
    expect(await zeta.boundingBox()).toEqual(zetaBefore);
    await refine([candidate("alpha")]);
    await expect(alpha).toBeVisible();
    expect(await alpha.boundingBox()).toEqual(alphaBefore);
    expect(await zeta.boundingBox()).toEqual(zetaBefore);
    const probe = await page.evaluate(() => {
      const probe = (window as unknown as { ghostProbe: { changes: unknown[]; frames: number; frame: number } }).ghostProbe;
      cancelAnimationFrame(probe.frame); return { frames: probe.frames, changes: probe.changes };
    });
    expect(probe.frames).toBeGreaterThan(0);
    expect(probe.changes).toEqual([]);
    expect(savedModelReads).toBe(0);
    expect(await camera(page)).toBe(savedCamera);
    expect(await f.xml()).toBe(workModelXml);
    expect(await f.canvas()).toEqual(savedCanvas);
    await expect(page.locator('[data-model-id="item:zeta"], [data-model-id="item:alpha"], [data-model-id="item:beta"]')).toHaveCount(0);
  } finally { await dispose(page, request, f); }
});

test("model-only edits become unsaved canvas overlays and persist only when the user approves", async ({ page, request }, testInfo) => {
  const f = await workshop(request);
  try {
    await openCanvas(page, f.project.id);
    const presentationBefore = await f.canvas();
    const controls = perspective(page);
    await expect(controls.getByRole("button", { name: /^(Before|Proposed|Current|History)$/ })).toHaveCount(0);
    await expect(controls.getByRole("button", { name: "Approve changes", exact: true })).toHaveCount(0);
    await expect(footprint(page, "context", "order")).toBeVisible();
    await send(page, workRequests.sketch);
    await expect.poll(async () => (await f.state()).work?.draft?.changes.map(change => change.kind).sort()).toEqual(["add", "add", "modify", "remove"]);
    await expect(controls).toContainText("Unsaved");
    await expect(footprint(page, "draft", "validation")).toHaveClass(/footprint-ghost/);
    await expect(footprint(page, "draft", "validates")).toHaveClass(/footprint-relationship/);
    await expect(page.locator('[data-agent-connection="validates"]')).toBeVisible();
    await expect(footprint(page, "draft", "legacy")).toBeVisible();
    await expect(page.locator('[data-model-id="item:validation"]')).toHaveCount(0);
    expect(await f.xml()).toBe(workModelXml);
    expect(await f.canvas()).toEqual(presentationBefore);
    const detail = await inspect(page, "order", "Order");
    await expect(detail).toContainText("A purchase accepted by the shop.");
    await expect(detail).toContainText("A purchase whose requested lines satisfy the acceptance rules.");
    await expect(detail.getByText("Saved", { exact: true }).first()).toBeVisible();
    await expect(detail.getByText("Draft", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Undo model|Undo latest/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("draft-overlay-desktop.png") });
    await detail.getByRole("button", { name: "Close inspection", exact: true }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await selectAgentOnCanvas(page, "Clarify validation");
    const bounds = (await controls.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("draft-overlay-mobile.png") });
    await controls.getByRole("button", { name: "Approve changes", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft).toBeUndefined();
    const saved = await f.xml();
    expect(saved).toContain('id="validation"');
    expect(saved).toContain('id="validates"');
    expect(saved).toContain("A purchase whose requested lines satisfy the acceptance rules.");
    expect(saved).not.toContain('id="legacy"');
    await expect(footprint(page, "draft", "validation")).toHaveCount(0);
    await expect(controls.getByRole("button", { name: "Approve changes", exact: true })).toHaveCount(0);
    await openAgentConversation(page);
    await expect(page.locator("#chat-pane").getByRole("button", { name: /Undo/ })).toHaveCount(0);
  } finally { await dispose(page, request, f); }
});

test("draft refinements use their candidate, survive reload and stop, and discard without changing model or canvas", async ({ page, request }) => {
  const f = await workshop(request);
  try {
    await openCanvas(page, f.project.id);
    const controls = perspective(page);
    const presentationBefore = await f.canvas();
    await send(page, workRequests.sketch);
    await expect.poll(async () => (await f.state()).work?.draft?.changes.length).toBe(4);
    const first = (await f.state()).work!.draft!;
    // FakeT3 reads through its real turn-bound MCP lease before constructing this patch.
    await send(page, "Rename Order to Purchase");
    await expect.poll(async () => (await f.state()).work?.draft?.changes.find(change => change.itemId === "order")?.after?.name).toBe("Purchase");
    const renamed = (await f.state()).work!.draft!;
    expect(renamed.id).not.toBe(first.id);
    expect(renamed.changes.find(change => change.itemId === "order")?.after?.description).toBe("A purchase whose requested lines satisfy the acceptance rules.");
    const staleApproval = await request.post(f.endpoint("draft-apply"), { data: { draftId: first.id } });
    expect(staleApproval.ok()).toBe(false);
    expect(await f.xml()).toBe(workModelXml);
    await send(page, workRequests.revise);
    await expect.poll(async () => (await f.state()).work?.draft?.changes.map(change => change.itemId).sort()).toEqual(["legacy", "order", "policy"]);
    await expect(footprint(page, "draft", "validation")).toHaveCount(0);
    await expect(page.locator('[data-agent-connection="validates"]')).toHaveCount(0);
    const scope = await request.post(f.endpoint("scope"), { data: { scope: "code" } });
    expect(scope.ok()).toBe(false);
    expect((await f.state()).scope).toBe("model");
    const beforeReload = (await f.state()).work!.draft!;
    await page.reload();
    await selectAgentOnCanvas(page, "Clarify validation");
    await expect(controls).toContainText("Unsaved");
    expect((await f.state()).work!.draft!.id).toBe(beforeReload.id);
    await send(page, "slow inspection", true);
    await expect(controls.getByRole("button", { name: "Approve changes", exact: true })).toBeDisabled();
    await openAgentConversation(page);
    await page.locator("#chat-pane").getByRole("button", { name: "Stop", exact: true }).click();
    await page.locator("#chat-pane").getByRole("button", { name: "Minimize agent", exact: true }).click();
    await expect(controls.getByRole("button", { name: "Approve changes", exact: true })).toBeEnabled();
    expect((await f.state()).work!.draft!.id).toBe(beforeReload.id);
    expect(await f.xml()).toBe(workModelXml);
    expect(await f.canvas()).toEqual(presentationBefore);
    await controls.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft).toBeUndefined();
    await expect(page.locator('[data-agent-footprint="draft"]')).toHaveCount(0);
    expect(await f.xml()).toBe(workModelXml);
    expect(await f.canvas()).toEqual(presentationBefore);
    await openAgentConversation(page);
    const pane = page.locator("#chat-pane");
    await expect(pane.getByText(workRequests.sketch, { exact: true })).toBeVisible();
    await pane.getByLabel("Editing scope").selectOption("code");
    await expect(pane.getByLabel("Editing scope")).toHaveValue("code");
  } finally { await dispose(page, request, f); }
});

test("a saved-model edit makes a draft stale and cannot be overwritten by approval", async ({ page, request }, testInfo) => {
  const f = await workshop(request);
  try {
    await openCanvas(page, f.project.id);
    await send(page, workRequests.apply);
    await expect.poll(async () => (await f.state()).work?.draft?.changes.length).toBe(2);
    const draft = (await f.state()).work!.draft!;
    const external = workModelXml.replace("A purchase accepted by the shop.", "A purchase with a human-defined spending limit.");
    await writeFile(join(f.root, "lexicon/model.xml"), external);
    await expect.poll(async () => (await f.state()).work?.draft?.stale).toBe(true);
    const controls = perspective(page);
    await expect(controls.getByRole("button", { name: "Approve changes", exact: true })).toBeDisabled();
    const result = await request.post(f.endpoint("draft-apply"), { data: { draftId: draft.id } });
    expect(result.ok()).toBe(false);
    expect(await f.xml()).toBe(external);
    await page.screenshot({ path: testInfo.outputPath("draft-stale.png") });
    await controls.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft).toBeUndefined();
    expect(await f.xml()).toBe(external);
  } finally { await dispose(page, request, f); }
});

test("approval revalidates source evidence and retains the draft when a link becomes invalid", async ({ page, request }, testInfo) => {
  const f = await workshop(request);
  try {
    await openCanvas(page, f.project.id);
    await send(page, workRequests.apply);
    await expect.poll(async () => (await f.state()).work?.draft?.changes.length).toBe(2);
    const draft = (await f.state()).work!.draft!;
    await writeFile(join(f.root, "policy.ts"), "export function renamedPolicy() { return true; }\n");
    const controls = perspective(page);
    await controls.getByRole("button", { name: "Approve changes", exact: true }).click();
    await expect(controls.getByRole("alert")).toContainText(/acceptOrder|source|symbol/i);
    expect((await f.state()).work!.draft!.id).toBe(draft.id);
    expect(await f.xml()).toBe(workModelXml);
    await page.screenshot({ path: testInfo.outputPath("draft-source-error.png") });
    await writeFile(join(f.root, "policy.ts"), "export function acceptOrder(quantity: number) { return quantity > 0; }\n");
    await controls.getByRole("button", { name: "Approve changes", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft).toBeUndefined();
    expect(await f.xml()).toContain("positive line quantities");
  } finally { await dispose(page, request, f); }
});

test("code scope saves MCP model edits directly without a draft gate or Lexicon undo", async ({ page, request }) => {
  const f = await workshop(request);
  try {
    await openCanvas(page, f.project.id);
    await openAgentConversation(page);
    const pane = page.locator("#chat-pane");
    await pane.getByLabel("Editing scope").selectOption("code");
    await expect(pane.getByLabel("Editing scope")).toHaveValue("code");
    await send(page, workRequests.apply);
    await expect.poll(f.xml).toContain("positive line quantities");
    expect(await f.xml()).not.toContain('id="legacy"');
    expect((await f.state()).work?.draft).toBeUndefined();
    await expect(perspective(page).getByRole("button", { name: /Approve changes|Discard draft/ })).toHaveCount(0);
    await expect(page.locator('[data-agent-footprint="draft"]')).toHaveCount(0);
    await openAgentConversation(page);
    await expect(pane.getByRole("button", { name: /Undo/ })).toHaveCount(0);
    await pane.getByRole("button", { name: "Task details", exact: true }).click();
    await expect(pane.getByRole("button", { name: /^Open in T3 Code/ })).toBeVisible();
  } finally { await dispose(page, request, f); }
});

test("working context uses canvas selection, remains independent of reader navigation, and keeps source evidence reachable", async ({ page, request }, testInfo) => {
  const f = await workshop(request);
  try {
    await page.goto(`/p/${f.project.id}?item=order`);
    await selectAgentOnCanvas(page, "Clarify validation");
    const controls = perspective(page);
    await controls.getByRole("button", { name: /^Context 2$/ }).click();
    await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
    await page.getByRole("button", { name: "Fit model", exact: true }).click();
    await page.locator('[data-model-id="item:order-line"]').click();
    await controls.getByRole("button", { name: "Add canvas selection", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.context.map(item => item.id).sort()).toEqual(["order", "order-line", "policy"]);
    await controls.getByRole("button", { name: "Remove Order Policy from context", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.context.map(item => item.id).sort()).toEqual(["order", "order-line"]);
    await page.locator(".sidebar .nav-item").filter({ hasText: /^Ordering$/ }).click();
    await expect(page.locator("main [data-reader-card].active h1")).toHaveText("Ordering");
    expect((await f.state()).work?.context.map(item => item.id).sort()).toEqual(["order", "order-line"]);
    expect(await readFile(join(f.root, "lexicon/model.xml"), "utf8")).toBe(workModelXml);
    await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
    await expect(page.locator("main [data-reader-card].active h1")).toHaveText("Order");
    await controls.getByRole("button", { name: "Context 2", exact: true }).click();
    await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
    const before = await camera(page);
    await footprint(page, "context", "order").getByRole("button").click();
    const detail = page.getByRole("dialog", { name: "Order context", exact: true });
    await expect(detail).toBeVisible();
    expect(await camera(page)).toBe(before);
    await expect(page.locator("#chat-pane")).toBeHidden();
    await detail.getByText("Source links", { exact: false }).click();
    await expect(detail.getByRole("button", { name: /^order.ts/ })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("canvas-context-inspection.png") });
    await detail.getByRole("button", { name: /^order.ts/ }).click();
    const source = page.getByRole("complementary", { name: "Source Reader", exact: true });
    await expect(source.locator(".source-controls")).toContainText("Declaration");
    await expect(source.locator(".source-line.highlighted")).toContainText("export interface Order");
    expect(new URL(page.url()).searchParams.get("code")).toBe('code:["order.ts","symbol","Order"]');
  } finally {
    await page.goto("/").catch(() => {});
    await request.delete(`/api/projects/${f.project.id}`).catch(() => {});
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a delayed context failure stays with its originating agent after the user selects another", async ({ page, request }) => {
  const f = await workshop(request);
  let release: (() => void) | undefined;
  try {
    const creation = await request.post(`/api/projects/${f.project.id}/agents`, { data: { name: "Observe orders", contextIds: ["order"] } });
    expect(creation.ok()).toBe(true);
    const gate = new Promise<void>(resolve => { release = resolve; });
    let arrived: (() => void) | undefined;
    const received = new Promise<void>(resolve => { arrived = resolve; });
    const action = `/api/projects/${f.project.id}/agent/context?agent=${f.agent.id}`;
    await page.route(`**${action}`, async route => {
      arrived!(); await gate;
      await route.fulfill({ status: 503, json: { error: "The original agent's context could not be saved." } });
    });
    await page.goto(`/p/${f.project.id}`);
    await selectAgentOnCanvas(page, "Clarify validation");
    const controls = perspective(page);
    await controls.getByRole("button", { name: "Context 2", exact: true }).click();
    await controls.getByRole("button", { name: "Remove Order Policy from context", exact: true }).click();
    await received;
    await selectAgentOnCanvas(page, "Observe orders");
    const returned = page.waitForResponse(response => response.url().endsWith(action));
    release!();
    await returned;
    await expect(controls.getByRole("alert")).toHaveCount(0);
    await selectAgentOnCanvas(page, "Clarify validation");
    await expect(controls.getByRole("alert")).toContainText("The original agent's context could not be saved.");
    await selectAgentOnCanvas(page, "Observe orders");
    await expect(controls.getByRole("alert")).toHaveCount(0);
    expect((await f.state()).work?.context.map(item => item.id).sort()).toEqual(["order", "policy"]);
  } finally {
    release?.();
    await page.goto("/").catch(() => {});
    await request.delete(`/api/projects/${f.project.id}`).catch(() => {});
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a metadata-only draft remains reviewable without inventing canvas objects", async ({ page, request }) => {
  const f = await workshop(request);
  try {
    await openCanvas(page, f.project.id);
    await send(page, workRequests.metadata);
    await expect.poll(async () => (await f.state()).work?.draft?.project?.after.name).toBe("Refined Order Workshop");
    expect((await f.state()).work!.draft!.changes).toEqual([]);
    await expect(page.locator('[data-agent-footprint="draft"]')).toHaveCount(0);
    const controls = perspective(page);
    await controls.getByRole("button", { name: "Changes 1", exact: true }).click();
    const project = controls.getByRole("region", { name: "Project changes", exact: true });
    await expect(project).toContainText("Order Workshop");
    await expect(project).toContainText("Refined Order Workshop");
    expect(await f.xml()).toBe(workModelXml);
    await controls.getByRole("button", { name: "Approve changes", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft).toBeUndefined();
    expect(await f.xml()).toContain("<name>Refined Order Workshop</name>");
  } finally { await dispose(page, request, f); }
});

test("a migration draft can be reviewed and approved in conversation before a canvas exists", async ({ page, request }, testInfo) => {
  const f = await workshop(request);
  try {
    const legacy = workModelXml.replace('schema="3.3"', 'schema="3.2"');
    await writeFile(join(f.root, "lexicon/model.xml"), legacy);
    await page.goto(`/p/${f.project.id}`);
    await expect(page.getByRole("heading", { name: "This model needs migration", exact: true })).toBeVisible();
    await expect(page.locator(".canvas-agent-markers")).toHaveCount(0);
    const hud = page.locator(".agent-hud-summary");
    if (await hud.getAttribute("aria-expanded") !== "true") await hud.click();
    await page.locator(".agent-roster").getByRole("button", { name: "Clarify validation", exact: true }).click();
    const pane = page.locator("#chat-pane");
    await expect(pane.getByLabel("Agent model")).not.toHaveValue("");
    await pane.getByLabel("Message the agent").fill(workRequests.migrate);
    await pane.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft?.migration).toBe(true);
    const draft = pane.getByRole("region", { name: "Unsaved model draft", exact: true });
    await draft.getByText("Review model draft", { exact: true }).click();
    await expect(draft).toContainText("Includes a model schema migration");
    const metadata = draft.getByRole("region", { name: "Project changes", exact: true });
    await expect(metadata.getByText("Saved", { exact: true })).toHaveCount(0);
    await expect(metadata).not.toContainText("Start with a question about this project.");
    await expect(draft.getByText("Draft item Order", { exact: true })).toBeVisible();
    await draft.getByText("Draft item Order", { exact: true }).click();
    await expect(draft).toContainText("A purchase accepted by the shop.");
    await expect(draft.getByText("Saved", { exact: true })).toHaveCount(0);
    expect(await f.xml()).toBe(legacy);
    await page.screenshot({ path: testInfo.outputPath("migration-draft-conversation.png") });
    await draft.getByRole("button", { name: "Approve changes", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft).toBeUndefined();
    await expect(page.getByRole("heading", { name: "This model needs migration", exact: true })).toHaveCount(0);
    expect(await f.xml()).toContain('schema="3.3"');
  } finally { await dispose(page, request, f); }
});
