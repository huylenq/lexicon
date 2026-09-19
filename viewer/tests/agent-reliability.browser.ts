import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentState } from "../shared/agent-runtime";
import type { ModelItem } from "../shared/model";
import { workModelXml, workRequests } from "./fixtures/agent-work";
import { selectAgentOnCanvas } from "./fixtures/agent-ui";

test.use({ serviceWorkers: "block" });
const controls = (page: Page) => page.getByRole("group", { name: "Agent perspective", exact: true });
async function fixture(request: APIRequestContext, xml = workModelXml) {
  const root = await mkdtemp(join(tmpdir(), "lexicon-agent-reliability-"));
  await mkdir(join(root, "lexicon")); await writeFile(join(root, "lexicon/model.xml"), xml);
  await writeFile(join(root, "order.ts"), "export interface Order { id: string }\n" + "// evidence\n".repeat(100));
  await writeFile(join(root, "policy.ts"), "export function acceptOrder() { return true; }\n" + "// evidence\n".repeat(100));
  const project = await (await request.post("/api/projects", { data: { root } })).json();
  const agent = await (await request.post(`/api/projects/${project.id}/agents`, { data: { name: "Review acceptance", contextIds: ["order"] } })).json();
  const endpoint = (action: string) => `/api/projects/${project.id}/agent/${action}?agent=${agent.id}`;
  const state = async () => await (await request.get(endpoint("state"))).json() as AgentState;
  const send = async (text: string) => {
    const model = await (await request.get(`/api/projects/${project.id}/model`)).json();
    const response = await request.post(endpoint("send"), { data: { text, modelRevision: model.modelRevision, instanceId: "codex", model: "test-model" } });
    expect(response.ok()).toBe(true);
    await expect.poll(async () => (await state()).running).toBe(false);
  };
  return { root, project, agent, endpoint, state, send, xml: () => readFile(join(root, "lexicon/model.xml"), "utf8") };
}
async function open(page: Page, id: string) {
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await selectAgentOnCanvas(page, "Review acceptance");
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
}
async function dispose(page: Page, request: APIRequestContext, f: Awaited<ReturnType<typeof fixture>>) {
  await page.goto("/"); await request.delete(`/api/projects/${f.project.id}`); await rm(f.root, { recursive: true, force: true });
}

test("approval review exposes source identity/locator and flow implementation changes with each column's names", async ({ page, request }) => {
  const xml = workModelXml.replace('kind="code" file="order.ts" symbol="Order"', 'kind="code" id="evidence-before" file="order.ts" symbol="Order" line="1"').replace("</lexicon>", `
<relationship id="invokes" from="api" to="policy"><name>invokes policy</name><description>Calls acceptance policy.</description></relationship>
<flow id="checkout"><name>Checkout</name><description>Accept an order.</description>
<code-link kind="code" id="caller" file="policy.ts" line="1" role="caller">Entry.</code-link>
<code-link kind="code" id="callee" file="policy.ts" line="2" role="callee">Policy.</code-link>
<code-link kind="code" id="site-before" file="policy.ts" line="3" role="usage">Old call site.</code-link>
<code-link kind="code" id="site-after" file="policy.ts" line="4" role="usage">New call site.</code-link>
<step id="before-step" relationship="invokes" caller="caller" callee="callee" call-site="site-before">Accept the order</step></flow>
</lexicon>`);
  const f = await fixture(request, xml);
  try {
    const model = await (await request.get(`/api/projects/${f.project.id}/model`)).json();
    const items = model.model.items as ModelItem[];
    const order = items.find(item => item.id === "order")!;
    const flow = items.find(item => item.type === "flow")!;
    const relationship = items.find(item => item.id === "invokes")!;
    await f.send("APPLICATION TRIAL " + JSON.stringify([{ tool: "lexicon_patch", arguments: { patch: { upsert: [
      { ...order, codeLinks: [{ kind: "document", id: "evidence-after", file: "order.ts", line: 80, role: "specification", description: "The requested acceptance rule." }] },
      { ...relationship, name: "runs policy" },
      { ...flow, steps: [{ id: "after-step", relationship: "invokes", label: "Accept the order", caller: "callee", callee: "caller", callSite: "site-after" }] },
    ] } } }]));
    await expect.poll(async () => (await f.state()).work?.draft?.changes.length).toBe(3);
    await open(page, f.project.id);
    await controls(page).getByRole("button", { name: /^Changes/ }).click();
    await controls(page).getByRole("button", { name: "Modified Order", exact: true }).click();
    const orderReview = page.getByRole("dialog", { name: "Order change details", exact: true });
    await expect(orderReview).toContainText("Kind: Code"); await expect(orderReview).toContainText("Kind: Document");
    await expect(orderReview).toContainText("ID: evidence-before"); await expect(orderReview).toContainText("ID: evidence-after");
    await expect(orderReview).toContainText("Line: 1"); await expect(orderReview).toContainText("Line: 80");
    await orderReview.getByRole("button", { name: "Close inspection", exact: true }).click();
    await controls(page).getByRole("button", { name: /^Changes/ }).click();
    await controls(page).getByRole("button", { name: "Modified Checkout", exact: true }).click();
    const flowReview = page.getByRole("dialog", { name: "Checkout change details", exact: true });
    for (const value of ["ID: before-step", "ID: after-step", "Caller: caller", "Caller: callee", "Callee: callee", "Callee: caller", "Call site: site-before", "Call site: site-after", "Relationship: invokes policy (invokes)", "Relationship: runs policy (invokes)"]) await expect(flowReview).toContainText(value);
    expect(await f.xml()).toBe(xml);
  } finally { await dispose(page, request, f); }
});

for (const lifecycle of ["settle", "archive"] as const) test(`${lifecycle} keeps an unsaved draft discoverable after reload and allows review without resuming`, async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await f.send(workRequests.sketch);
    await expect.poll(async () => (await f.state()).work?.draft?.changes.length).toBe(4);
    expect((await request.post(f.endpoint(lifecycle), { data: {} })).ok()).toBe(true);
    await page.goto(`/p/${f.project.id}`);
    await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
    await page.getByRole("radio", { name: "Combined", exact: true }).check();
    await page.reload();
    await expect(page.locator(".agent-hud-summary")).toContainText("1 unsaved draft");
    await page.locator(".agent-hud-summary").click();
    const history = page.getByRole("region", { name: "Drafts in task history", exact: true });
    await expect(history).toContainText(lifecycle === "settle" ? "Settled" : "Archived");
    await history.getByRole("button", { name: "Review draft Review acceptance", exact: true }).click();
    await expect(controls(page)).toContainText("Unsaved");
    await expect(controls(page).getByRole("button", { name: "Resume conversation", exact: true })).toBeVisible();
    expect((await f.state()).lifecycle).toBe(lifecycle === "settle" ? "settled" : "archived");
    expect(await f.xml()).toBe(workModelXml);
    await controls(page).getByRole("button", { name: lifecycle === "settle" ? "Approve changes" : "Discard draft", exact: true }).click();
    await expect.poll(async () => (await f.state()).work?.draft).toBeUndefined();
    await expect(page.locator(".agent-hud-summary")).not.toContainText("unsaved draft");
    expect((await f.state()).lifecycle).toBe(lifecycle === "settle" ? "settled" : "archived");
    if (lifecycle === "archive") expect(await f.xml()).toBe(workModelXml);
    else expect(await f.xml()).toContain('id="validation"');
  } finally { await dispose(page, request, f); }
});

test("a delayed HTTP snapshot cannot replace a newer SSE draft, and a new server generation can reset revisions", async ({ page, request }) => {
  const f = await fixture(request);
  let release = () => {};
  try {
    // Only the provider-state transport is controlled. Model APIs and leased MCP run normally.
    await page.addInitScript(() => {
      const NativeEventSource = window.EventSource;
      type Controlled = EventTarget & { closed: boolean; onerror: (() => void) | null };
      const streams: Controlled[] = [];
      (window as unknown as { testAgentStreams: Controlled[] }).testAgentStreams = streams;
      window.EventSource = class extends EventTarget {
        closed = false; onerror: (() => void) | null = null;
        constructor(url: string | URL, init?: EventSourceInit) {
          super();
          if (!String(url).includes("/agent/events?")) return new NativeEventSource(url, init) as unknown as this;
          streams.push(this); queueMicrotask(() => this.dispatchEvent(new Event("open")));
        }
        close() { this.closed = true; }
      } as unknown as typeof EventSource;
    });
    await f.send("Explain order acceptance");
    const original = await f.state();
    await open(page, f.project.id);
    const publish = (state: AgentState) => page.evaluate(state => {
      const stream = (window as unknown as { testAgentStreams: Array<{ closed: boolean; dispatchEvent: (event: Event) => void }> }).testAgentStreams.filter(stream => !stream.closed).at(-1)!;
      stream.dispatchEvent(new MessageEvent("state", { data: JSON.stringify({ kind: "snapshot", state }) }));
    }, state);
    await publish(original);
    let captured = () => {};
    const requested = new Promise<void>(resolve => { captured = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${f.endpoint("state")}`, async route => { captured(); await held; await route.fulfill({ json: original }); });
    await page.evaluate(() => (window as unknown as { testAgentStreams: Array<{ closed: boolean; onerror: (() => void) | null }> }).testAgentStreams.filter(stream => !stream.closed).at(-1)!.onerror?.());
    await requested;
    await f.send(workRequests.sketch);
    const latest = await f.state();
    expect(latest.revision).toBeGreaterThan(original.revision);
    await publish(latest);
    await expect(controls(page)).toContainText("Unsaved");
    const delayedResponse = page.waitForResponse(response => response.url().endsWith(f.endpoint("state")));
    release(); await (await delayedResponse).finished();
    await expect(controls(page).getByRole("button", { name: "Approve changes", exact: true })).toBeEnabled();
    const restarted = { ...latest, generation: "fixture-restarted-server", revision: 1, work: { ...latest.work!, draft: undefined }, scope: "code" as const };
    await publish(restarted);
    await expect(controls(page).getByRole("button", { name: "Approve changes", exact: true })).toHaveCount(0);
    await publish({ ...latest, revision: 999999 });
    await expect(controls(page).getByRole("button", { name: "Approve changes", exact: true })).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await dispose(page, request, f); }
});
