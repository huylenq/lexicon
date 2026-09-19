import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyAgent, type AgentState } from "../shared/agent-runtime";
import { workModelXml } from "./fixtures/agent-work";
import { openAgentConversation, selectAgentOnCanvas } from "./fixtures/agent-ui";

test.use({ serviceWorkers: "block" });

async function fixture(request: APIRequestContext, count = 1) {
  const root = await mkdtemp(join(tmpdir(), "lexicon-agent-performance-"));
  await mkdir(join(root, "lexicon")); await writeFile(join(root, "lexicon/model.xml"), workModelXml);
  await writeFile(join(root, "order.ts"), "export interface Order { id: string }\n");
  await writeFile(join(root, "policy.ts"), "export function acceptOrder() { return true; }\n");
  const project = await (await request.post("/api/projects", { data: { root } })).json();
  const agents: { id: string; name: string }[] = [];
  for (let index = 0; index < count; index++) agents.push(await (await request.post(`/api/projects/${project.id}/agents`, {
    data: { name: `Performance agent ${index + 1}`, contextIds: ["order"] },
  })).json());
  return { root, project, agents };
}
async function open(page: Page, projectId: string) {
  await page.goto(`/p/${projectId}`);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
}
async function dispose(page: Page, request: APIRequestContext, f: Awaited<ReturnType<typeof fixture>>) {
  await page.goto("/"); await request.delete(`/api/projects/${f.project.id}`); await rm(f.root, { recursive: true, force: true });
}

test("three hidden 200-message transcripts do no history render work during pan and retain draft text and scroll", async ({ page, request }) => {
  const f = await fixture(request, 3);
  const states = new Map(f.agents.map(agent => [agent.id, {
    ...emptyAgent(), generation: "performance-fixture", revision: 1, connected: true,
    messages: Array.from({ length: 200 }, (_, index) => ({ id: `perf-message-${agent.id}-${index}`, role: index % 2 ? "assistant" : "user", streaming: false,
      text: `Message ${index}. **A modeled rule** with a [source](https://example.test/source), and enough text to scroll through the retained conversation.` })),
  } satisfies AgentState]));
  try {
    // Count the fixture history maps at the actual rendering boundary without
    // adding profiling hooks or global instrumentation to the production app.
    await page.addInitScript(() => {
      const original = Array.prototype.map;
      const counters = (window as unknown as { agentPerf: { historyMaps: number } }).agentPerf = { historyMaps: 0 };
      Array.prototype.map = function (this: unknown[], ...args: Parameters<typeof original>) {
        const first = this[0] as { id?: string; role?: string } | undefined;
        if (first?.id?.startsWith("perf-message-") && first.role) counters.historyMaps++;
        return original.apply(this, args);
      } as typeof original;
      const NativeEventSource = window.EventSource;
      window.EventSource = class extends EventTarget {
        closed = false; onerror: (() => void) | null = null; heartbeat?: ReturnType<typeof setInterval>;
        constructor(url: string | URL, init?: EventSourceInit) {
          super();
          if (!String(url).includes("/agent/events?")) return new NativeEventSource(url, init) as unknown as this;
          queueMicrotask(() => {
            if (this.closed) return;
            this.dispatchEvent(new Event("open"));
            void fetch(String(url).replace("/agent/events?", "/agent/state?")).then(response => response.json()).then(state => {
              if (!this.closed) this.dispatchEvent(new MessageEvent("state", { data: JSON.stringify({ kind: "snapshot", state }) }));
            });
            this.heartbeat = setInterval(() => this.dispatchEvent(new Event("ping")), 1000);
          });
        }
        close() { this.closed = true; clearInterval(this.heartbeat); }
      } as unknown as typeof EventSource;
    });
    await page.route(`**/api/projects/${f.project.id}/agent/state?*`, async route => {
      const id = new URL(route.request().url()).searchParams.get("agent")!;
      await route.fulfill({ json: states.get(id) });
    });
    await open(page, f.project.id);
    for (const agent of f.agents) {
      await selectAgentOnCanvas(page, agent.name); await openAgentConversation(page);
      const pane = page.locator("#chat-pane");
      await expect(pane.locator(".chat-message")).toHaveCount(200);
      await pane.getByLabel("Message the agent").fill(`Keep composer for ${agent.name}`);
      await pane.locator(".chat-transcript").evaluate(element => { element.scrollTop = 240; element.dispatchEvent(new Event("scroll")); });
      await expect(pane.getByRole("button", { name: "Jump to latest ↓", exact: true })).toBeVisible();
      await pane.getByRole("button", { name: "Minimize agent", exact: true }).click();
    }
    await expect(page.locator(".chat-message")).toHaveCount(600);
    await page.evaluate(() => { (window as unknown as { agentPerf: { historyMaps: number } }).agentPerf.historyMaps = 0; });
    await page.mouse.move(1100, 750); await page.mouse.down({ button: "middle" });
    await page.mouse.move(1230, 790, { steps: 16 }); await page.mouse.up({ button: "middle" });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => (window as unknown as { agentPerf: { historyMaps: number } }).agentPerf.historyMaps)).toBe(0);
    for (const agent of f.agents) {
      await selectAgentOnCanvas(page, agent.name); await openAgentConversation(page);
      await expect(page.locator("#chat-pane").getByLabel("Message the agent")).toHaveValue(`Keep composer for ${agent.name}`);
      expect(await page.locator("#chat-pane .chat-transcript").evaluate(element => element.scrollTop)).toBe(240);
      await page.locator("#chat-pane").getByRole("button", { name: "Minimize agent", exact: true }).click();
    }
  } finally { await dispose(page, request, f); }
});

test("Planes agent markers perform zero idle DOM measurements and update on camera, tilt, and resize", async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await page.addInitScript(() => {
      const counters = (window as unknown as { markerPerf: { modelReads: number; cornerReads: number; indexScans: number } }).markerPerf = { modelReads: 0, cornerReads: 0, indexScans: 0 };
      const bounds = Element.prototype.getBoundingClientRect, query = Element.prototype.querySelectorAll;
      Element.prototype.getBoundingClientRect = function () {
        if (this.matches("[data-model-id], [data-connection-id]")) counters.modelReads++;
        if (this.hasAttribute("data-plane-corner")) counters.cornerReads++;
        return bounds.call(this);
      };
      Element.prototype.querySelectorAll = function (this: Element, selector: string) {
        if (this.classList.contains("planes-stage") && selector === "[data-model-id], [data-connection-id]") counters.indexScans++;
        return query.call(this, selector);
      } as typeof query;
    });
    await open(page, f.project.id);
    // Presentation switching waits for canvas persistence before replacing the radio.
    await page.getByRole("radio", { name: "Planes", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Planes", exact: true })).toBeChecked();
    await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
    await selectAgentOnCanvas(page, f.agents[0].name);
    const card = page.locator(`.agent-canvas-card[data-agent-id="${f.agents[0].id}"]`);
    await expect(card).toBeVisible();
    const reset = () => page.evaluate(() => { Object.assign((window as unknown as { markerPerf: object }).markerPerf, { modelReads: 0, cornerReads: 0, indexScans: 0 }); });
    const counts = () => page.evaluate(() => (window as unknown as { markerPerf: { modelReads: number; cornerReads: number; indexScans: number } }).markerPerf);
    await page.waitForTimeout(400); await reset(); await page.waitForTimeout(500);
    expect(await counts()).toEqual({ modelReads: 0, cornerReads: 0, indexScans: 0 });
    const before = (await card.boundingBox())!;
    await page.mouse.move(1100, 750); await page.mouse.down({ button: "middle" });
    await page.mouse.move(1170, 790, { steps: 10 }); await page.mouse.up({ button: "middle" });
    await expect.poll(async () => (await card.boundingBox())!.x).toBeCloseTo(before.x + 70, 0);
    expect((await counts()).modelReads).toBeGreaterThan(0);
    expect((await counts()).indexScans).toBe(0);
    await page.waitForTimeout(250); await reset(); await page.waitForTimeout(500);
    expect(await counts()).toEqual({ modelReads: 0, cornerReads: 0, indexScans: 0 });
    await page.getByLabel("Plane options", { exact: true }).click();
    await reset(); await page.getByLabel("Tilt", { exact: true }).press("ArrowRight");
    await expect.poll(async () => (await counts()).modelReads).toBeGreaterThan(0);
    await page.getByLabel("Plane options", { exact: true }).click();
    await reset(); await page.setViewportSize({ width: 1400, height: 900 });
    await expect.poll(async () => (await counts()).modelReads).toBeGreaterThan(0);
    await page.waitForTimeout(400); await reset(); await page.waitForTimeout(500);
    expect(await counts()).toEqual({ modelReads: 0, cornerReads: 0, indexScans: 0 });
  } finally { await dispose(page, request, f); }
});

test("idle agents poll only the model revision and load the model after an external edit", async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await open(page, f.project.id);
    await selectAgentOnCanvas(page, f.agents[0].name);
    let revisions = 0, models = 0;
    const base = `/api/projects/${f.project.id}/model`;
    page.on("request", call => {
      const path = new URL(call.url()).pathname;
      if (path === `${base}/revision`) revisions++;
      if (path === base) models++;
    });
    await expect.poll(() => revisions, { timeout: 7000 }).toBeGreaterThan(0);
    expect(models).toBe(0);
    await writeFile(join(f.root, "lexicon/model.xml"), workModelXml.replace("<name>Order</name>", "<name>Externally refined order</name>"));
    await expect(page.locator('[data-model-id="item:order"]').first()).toContainText("Externally refined order", { timeout: 10_000 });
    expect(models).toBe(1);
  } finally { await dispose(page, request, f); }
});
