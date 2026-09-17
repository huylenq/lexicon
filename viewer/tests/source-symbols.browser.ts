import { ArrowBindingUtil, ArrowShapeUtil, NoteShapeUtil } from "tldraw";
import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canvasSchema } from "../shared/canvas-schema";
import { MODEL_SCHEMA, sourceTargetId } from "../shared/model";

let root: string, id: string, xml: string;
const kinds = { Agent: "class", "Agent.run": "method", createAgent: "function", AgentConfig: "interface", AgentId: "type", RunState: "enum", activeAgent: "variable", Missing: "symbol" };
const code = `export class Agent { run() { return true; } }
export function createAgent() { return new Agent(); }
export interface AgentConfig { name: string }
export type AgentId = string;
export enum RunState { Ready, Running }
export let activeAgent: Agent | undefined;
`;
const whole = sourceTargetId({ kind: "document", file: "docs/reference.md" });
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page, request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-source-glyphs-"));
  for (const dir of ["lexicon", "src", "docs"]) await mkdir(join(root, dir));
  await writeFile(join(root, "src/agent.ts"), code);
  await writeFile(join(root, "docs/agent-guide.md"), "# Agent guide\n\n## Configuration\n\nSupply a name.\n");
  await writeFile(join(root, "docs/reference.md"), "# Agent reference\n\nFile-level guidance.\n");
  xml = `<lexicon schema="${MODEL_SCHEMA}" id="glyphs"><name>Agent sources</name><description>Source glyph review.</description><context id="agents"><name>Agents</name><description>Agent execution.</description><concept id="agent"><name>Agent</name><description>A configured agent.</description>
${Object.keys(kinds).map(symbol => `<code-link kind="code" file="src/agent.ts" symbol="${symbol}" role="definition">${symbol}.</code-link>`).join("\n")}
<code-link kind="code" file="src/agent.ts" role="implementation">Full implementation.</code-link>
<code-link kind="document" file="src/agent.ts" role="reference">Documentary reading.</code-link>
<code-link kind="document" file="docs/agent-guide.md" heading="configuration" role="specification">Configuration rules.</code-link>
<code-link kind="code" file="src/agent.ts" line="6" role="usage">Active agent.</code-link>
<code-link kind="document" id="reference" file="docs/reference.md" role="reference">Reference guide.</code-link>
</concept></context></lexicon>`;
  await writeFile(join(root, "lexicon/model.xml"), xml);
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBe(true); id = (await response.json()).id;
  await page.goto(`/p/${id}`);
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${id}`);
  await rm(root, { recursive: true, force: true });
});

test("linked symbols have distinct glyphs, refresh from source, and retain a usable fallback", async ({ page, request }) => {
  const stage = page.locator('.canvas-stage');
  for (const [symbol, kind] of Object.entries(kinds))
    await expect(stage.getByRole("button", { name: `code: ${symbol}`, exact: true }).locator("[data-source-target-kind]")).toHaveAttribute("data-source-target-kind", kind);
  await expect(stage.locator('[data-source-target-kind="heading"]')).toHaveCount(1);
  await expect(stage.locator('[data-source-target-kind="line"]')).toHaveCount(1);
  await expect(stage.getByRole("button", { name: "code: Whole file", exact: true })).toHaveCount(0);
  const save = async () => (await (await request.get(`/api/projects/${id}/canvas`)).json()).document?.snapshot.store || {};
  const emptyHeight = await stage.locator('[data-model-id="file:docs/reference.md"]').evaluate(el => parseFloat((el as HTMLElement).style.height));
  await expect.poll(async () => Object.values(await save()).some((r: any) => r.props?.graphId === "file:docs/reference.md" && r.props.h === emptyHeight)).toBe(true);
  for (const name of ["Toggle reader", "Toggle navigation"]) {
    const toggle = page.getByRole("button", { name, exact: true });
    if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  }
  await expect(page.locator('.reading-pane')).toBeHidden();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.waitForTimeout(350); // Capture after the fit animation, at readable scale.
  await page.screenshot({ path: "/tmp/lexicon-source-symbols-light.png", animations: "disabled" });
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.screenshot({ path: "/tmp/lexicon-source-symbols-dark.png", animations: "disabled" });
  await stage.getByRole("button", { name: "file: reference.md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agent reference", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("code")).toBe(whole);
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await stage.getByRole("button", { name: "code: Agent.run", exact: true }).click();
  await expect(page.getByLabel("Source code", { exact: true })).toContainText("run()");
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.route(`**/api/projects/${id}/source-metadata`, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Unavailable"}' }));
  await page.reload();
  await expect(stage.getByRole("button", { name: "code: Agent", exact: true }).locator("[data-source-target-kind]")).toHaveAttribute("data-source-target-kind", "symbol");
  await page.unroute(`**/api/projects/${id}/source-metadata`);
  await writeFile(join(root, "src/agent.ts"), "export function Agent() {}\n");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(stage.getByRole("button", { name: "code: Agent", exact: true }).locator("[data-source-target-kind]")).toHaveAttribute("data-source-target-kind", "function");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("whole-file edges, old URLs, and attached canvas content resolve to the file card", async ({ page, request }) => {
  const state = async () => (await (await request.get(`/api/projects/${id}/canvas`)).json());
  await expect(page.locator(".canvas-save-indicator")).toContainText("Saved to project");
  await page.goto("about:blank");
  const old = await state(), records = old.document.snapshot.store;
  const file: any = Object.values(records).find((r: any) => r.props?.graphId === "file:docs/reference.md");
  const row: any = Object.values(records).find((r: any) => r.props?.graphId?.includes('"Agent.run"'));
  const oldId = `shape:lexicon-view:layers-source:${encodeURIComponent(whole)}`;
  records[oldId] = { ...row, id: oldId, parentId: file.id, x: 10, y: 52, props: { ...row.props, graphId: whole, w: 228, h: 44 }, meta: { ...row.meta, lexiconLabel: "Whole file" } };
  file.props.h = 110;
  const note = canvasSchema.types.shape.create({ id: "shape:whole-note", type: "note", parentId: "page:layers-source-links", index: "a9", x: 750, y: 400,
    props: { ...NoteShapeUtil.prototype.getDefaultProps(), richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "File evidence" }] }] } } } as any);
  const arrow = canvasSchema.types.shape.create({ id: "shape:whole-arrow", type: "arrow", parentId: "page:layers-source-links", index: "a8", x: 700, y: 300, props: ArrowShapeUtil.prototype.getDefaultProps() } as any);
  const noteBinding = canvasSchema.types.binding.create({ id: "binding:whole-note", type: "lexicon-note", fromId: note.id, toId: oldId, props: { x: 400, y: 200 } } as any);
  const arrowBinding = canvasSchema.types.binding.create({ id: "binding:whole-arrow", type: "arrow", fromId: arrow.id, toId: oldId, props: { ...ArrowBindingUtil.prototype.getDefaultProps(), terminal: "end", isPrecise: true, isExact: true, normalizedAnchor: { x: .5, y: .5 } } } as any);
  for (const record of [note, arrow, noteBinding, arrowBinding]) records[record.id] = record;
  const response = await request.put(`/api/projects/${id}/canvas`, { data: { revision: old.revision, document: old.document } });
  expect(response.ok(), await response.text()).toBe(true);
  await page.goto(`/p/${id}?code=${encodeURIComponent(whole)}&focus=code`);
  await expect(page.getByRole("heading", { name: "Agent reference", exact: true })).toBeVisible();
  const stage = page.locator('.canvas-stage');
  await expect(stage.locator('[data-model-id="file:docs/reference.md"]')).toHaveAttribute("data-selected", "true");
  await expect.poll(async () => (await state()).document.snapshot.store[oldId]).toBeUndefined();
  let upgraded = (await state()).document.snapshot.store;
  expect(upgraded[noteBinding.id].toId).toBe(file.id);
  expect(upgraded[arrowBinding.id].toId).toBe(file.id);
  expect(upgraded[note.id]).toMatchObject({ x: 750, y: 400 });
  const frame = await stage.locator('[data-model-id="file:docs/reference.md"]').evaluate(el => {
    const s = (el as HTMLElement).style;
    return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  const anchor = upgraded[arrowBinding.id].props.normalizedAnchor;
  // The old row's precise point was (10 + 228/2, 52 + 44/2) in file space.
  expect(frame.x + anchor.x * frame.w).toBeCloseTo(124);
  expect(frame.y + anchor.y * frame.h).toBeCloseTo(74);
  expect(upgraded[file.id].props.h).toBe(frame.h);
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(stage.locator('[data-model-id="file:docs/reference.md"]')).toBeVisible();
  await expect(stage.getByRole("button", { name: "code: Whole file", exact: true })).toHaveCount(0);
  await expect.poll(async () => Object.values((await state()).document.snapshot.store).some((r: any) => r.meta?.combinedSourceId === noteBinding.id && r.toId.includes(encodeURIComponent("file:docs/reference.md")))).toBe(true);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  // Routes are derived, so check the rendered endpoint rather than saved placeholders.
  await expect.poll(() => stage.evaluate(element => {
    const label = [...element.querySelectorAll("[data-connection-id]")].find(el => el.getAttribute("data-connection-id") === 'mapping:["agent","reference"]');
    const path = label?.closest(".canvas-connection")?.querySelector("[data-route-current] > path") as SVGPathElement | undefined;
    const card = element.querySelector('[data-model-id="file:docs/reference.md"]');
    if (!path || !card || !path.getScreenCTM()) return false;
    const point = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!);
    const box = card.getBoundingClientRect(), { x, y } = point;
    return x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2 &&
      Math.min(Math.abs(x - box.left), Math.abs(x - box.right), Math.abs(y - box.top), Math.abs(y - box.bottom)) < 2;
  })).toBe(true);
  // Authored kind remains distinct even when two links share the same file card.
  for (const kind of ["code", "document"] as const) {
    const target = sourceTargetId({ kind, file: "src/agent.ts" });
    const excerpt = await (await request.get(`/api/projects/${id}/code?target=${encodeURIComponent(target)}`)).json();
    expect(excerpt.kind).toBe(kind); expect(excerpt.status).toBe("file");
  }
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"] [data-model-id="file:docs/reference.md"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"] [data-source-target-kind="document"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  upgraded = (await state()).document.snapshot.store;
  expect(upgraded[noteBinding.id].toId).toBe(file.id);
  expect(upgraded[oldId]).toBeUndefined();
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("fresh and arranged source file boundaries remain separated", async ({ page }) => {
  const stage = page.locator('.canvas-stage');
  for (const arrange of [false, true]) {
    if (arrange) await page.getByRole("button", { name: "Arrange", exact: true }).click();
    await expect(page.getByText("Arranging the canvas…")).toBeHidden();
    await page.getByRole("button", { name: "Fit model", exact: true }).click();
    await expect.poll(() => stage.locator('[data-source-kind="file"]').evaluateAll(elements => {
      if (elements.length !== 3) return false;
      const boxes = elements.map(el => el.getBoundingClientRect());
      return boxes.every((a, i) => boxes.every((b, j) => i === j ||
        a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top));
    })).toBe(true);
  }
});
