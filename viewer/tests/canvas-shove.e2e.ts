import { expect, test, type APIRequestContext, type Page, type Locator } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.use({ reducedMotion: "reduce" });

let root: string, project: string, xml: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-shove-"));
  await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
  await rm(join(root, "lexicon/canvas.json"), { force: true });
  await rm(join(root, "lexicon/.canvas.previous.json"), { force: true });
  xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
  project = (await (await request.post("/api/projects", { data: { root } })).json()).id;
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${project}`);
  await rm(root, { recursive: true, force: true });
});

const transform = (label: Locator) => label.evaluate(el => (el.closest('.tl-shape') as HTMLElement).style.transform);

async function settledTransform(label: Locator) {
  let settled = "";
  await expect.poll(async () => {
    // Require stability across rendered frames, regardless of machine speed.
    const samples = await label.evaluate(async el => {
      const shape = el.closest('.tl-shape') as HTMLElement;
      const values: string[] = [];
      for (let i = 0; i < 5; i++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        values.push(shape.style.transform);
      }
      return values;
    });
    settled = samples[0];
    return settled !== "" && samples.every(value => value === settled);
  }).toBe(true);
  return settled;
}

async function records(page: Page, request: APIRequestContext, scope?: string) {
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  let snapshot: any[] = [];
  await expect.poll(async () => {
    const result = await (await request.get(`/api/projects/${project}/canvas`)).json();
    snapshot = Object.values(result.document.snapshot.store);
    // A newly selected view can render before its first projection save completes.
    return !scope || snapshot.some(r => r.type === "lexicon-object" && r.meta.lexiconProjection === scope);
  }).toBe(true);
  return snapshot;
}
const position = (records: any[], scope: string, graph: string) => {
  const shape = records.find(r => r.type === "lexicon-object" && r.meta.lexiconProjection === scope && r.props.graphId === graph);
  return { x: shape.x, y: shape.y, parentId: shape.parentId };
};
const cases = [
  { view: "Domain", plane: "domain", scope: "domain", a: "concept: Order", b: "concept: Order Line", graphA: "item:order", graphB: "item:order-line" },
  { view: "Architecture", plane: "architecture", scope: "architecture", a: "component: Order Handling", b: "component: Order Repository", graphA: "item:checkout", graphB: "item:repository" },
  { view: "Linked Sources", plane: "source", scope: "layers-source", a: "file: repository.ts", b: "file: checkout.ts", graphA: "file:src/repository.ts", graphB: "file:src/checkout.ts" },
];

for (const mode of ["flat", "Combined", "Planes"]) for (const fixture of cases) {
  test(`${mode} ${fixture.plane}: previews displacement, commits without rearranging, and undoes together`, async ({ page, request }, info) => {
    if (mode === "flat" && fixture.plane === "domain") await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/p/${project}`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await page.getByRole("radio", { name: mode === "flat" ? fixture.view : mode, exact: true }).click();
    await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
    if (mode !== "Planes") {
      await page.getByRole("radio", { name: "Standard", exact: true }).check();
      await page.getByRole("button", { name: "Fit model", exact: true }).click();
    } else await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
    const stage = mode === "Planes" ? page.locator(`[data-plane="${fixture.plane}"]`) : page.locator('.canvas-stage');
    const a = stage.getByRole("button", { name: fixture.a, exact: true });
    const b = stage.getByRole("button", { name: fixture.b, exact: true });
    await expect(a).toBeVisible(); await expect(b).toBeVisible();
    const scope = mode === "Planes" ? `layers-${fixture.plane}` : mode === "Combined" ? "combined" : fixture.scope;
    const before = await records(page, request, scope);
    if (mode !== "Planes") await page.getByRole("button", { name: "Fit model", exact: true }).click();
    if (mode === "Combined" && fixture.plane === "source") {
      await page.mouse.move(800, 500);
      for (let i = 0; i < 3; i++) {
        const width = (await a.boundingBox())!.width;
        await page.mouse.wheel(0, 250);
        await expect.poll(async () => (await a.boundingBox())!.width).toBeLessThan(width * .95);
      }
      await settledTransform(a);
    }
    const boxA = (await a.boundingBox())!, boxB = (await b.boundingBox())!;
    const neighborTransform = await transform(b);
    // Relationship labels can cross file headings in tilted Planes; use their clear right edge.
    const headingPoint = (box: typeof boxA) => ({
      x: box.x + (fixture.plane === "architecture" ? 8 : fixture.plane === "source" ? box.width - 12 : box.width / 2),
      y: box.y + box.height / 2,
    });
    const start = headingPoint(boxA), end = headingPoint(boxB);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 20 });
    await expect.poll(() => transform(b)).not.toBe(neighborTransform);
    const previewTransform = await settledTransform(b);
    await page.screenshot({ path: info.outputPath("live-preview.png") });
    await page.mouse.up();
    expect(await transform(b)).toBe(previewTransform);
    await expect.poll(async () => position(await records(page, request), scope, fixture.graphB)).not.toEqual(position(before, scope, fixture.graphB));
    const after = await records(page, request);
    await page.screenshot({ path: info.outputPath("shove-after-drop.png") });
    expect(position(after, scope, fixture.graphA).parentId).toBe(position(before, scope, fixture.graphA).parentId);
    if (mode === "Combined") {
      const mirrored = position(after, scope, fixture.graphB);
      expect(position(after, fixture.scope, fixture.graphB)).toMatchObject({ x: mirrored.x, y: mirrored.y });
      expect(position(after, fixture.scope, fixture.graphB).parentId).toBe(position(before, fixture.scope, fixture.graphB).parentId);
    }
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => position(await records(page, request), scope, fixture.graphB)).toEqual(position(before, scope, fixture.graphB));
    expect(position(await records(page, request), scope, fixture.graphA)).toEqual(position(before, scope, fixture.graphA));
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(async () => position(await records(page, request), scope, fixture.graphB)).toEqual(position(after, scope, fixture.graphB));
    await page.reload();
    await expect(a).toBeVisible();
    expect(position(await records(page, request), scope, fixture.graphB)).toEqual(position(after, scope, fixture.graphB));
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  });
}

test("Escape restores a displaced neighbor and stops the preview animation", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/p/${project}`);
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  const stage = page.locator('.canvas-stage');
  const a = stage.getByRole("button", { name: "concept: Order", exact: true });
  const b = stage.getByRole("button", { name: "concept: Order Line", exact: true });
  await expect(a).toBeVisible();
  const before = await records(page, request), first = (await a.boundingBox())!, second = (await b.boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 20 });
  await expect.poll(async () => (await b.boundingBox())!.y).not.toBe(second.y);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await settledTransform(b); // Observe frames after cancellation before checking saved positions.
  await expect.poll(async () => position(await records(page, request), "domain", "item:order-line")).toEqual(position(before, "domain", "item:order-line"));
  expect(position(await records(page, request), "domain", "item:order")).toEqual(position(before, "domain", "item:order"));
});

test("restored Architecture objects clear stale missing flags and shove again", async ({ page, request }) => {
  await page.goto(`/p/${project}`);
  await page.getByRole("radio", { name: "Architecture", exact: true }).click();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await records(page, request, "architecture");
  const saved = await (await request.get(`/api/projects/${project}/canvas`)).json();
  const shapes = Object.values(saved.document.snapshot.store) as any[];
  // Persist the state left by a model edit that temporarily removed these items.
  const restored = shapes.filter(r => r.meta?.lexiconProjection === "architecture" &&
    (r.type === "lexicon-object" || r.type === "lexicon-connection"));
  for (const shape of restored) shape.meta.lexiconMissing = true;
  expect((await request.put(`/api/projects/${project}/canvas`, {
    data: { revision: saved.revision, document: saved.document },
  })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const a = page.getByRole("button", { name: "component: Order Handling", exact: true });
  const b = page.getByRole("button", { name: "component: Order Repository", exact: true });
  const first = (await a.boundingBox())!, second = (await b.boundingBox())!;
  const original = await transform(b);
  await page.mouse.move(first.x + 8, first.y + first.height / 2); await page.mouse.down();
  await page.mouse.move(second.x + 8, second.y + second.height / 2, { steps: 20 });
  await expect.poll(() => transform(b)).not.toBe(original);
  await page.mouse.up();
  const after = await records(page, request, "architecture");
  for (const shape of restored) expect(after.find(r => r.id === shape.id).meta.lexiconMissing).toBe(false);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => position(await records(page, request), "architecture", "item:repository"))
    .toEqual(position(shapes, "architecture", "item:repository"));
});

test("source target rows shove the destination row and adjacent files beyond the authored file frame", async ({ page, request }) => {
  await page.goto(`/p/${project}`);
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const stage = page.locator('.canvas-stage');
  const a = stage.getByRole("button", { name: "code: Order", exact: true });
  const b = stage.getByRole("button", { name: "code: Order.constructor", exact: true });
  const id = (label: typeof a) => label.evaluate(el => el.closest('[data-model-id]')!.getAttribute('data-model-id')!);
  const graphA = await id(a), graphB = await id(b);
  const before = await records(page, request), first = (await a.boundingBox())!, second = (await b.boundingBox())!;
  await page.mouse.move(first.x + 8, first.y + first.height / 2); await page.mouse.down();
  await page.mouse.move(second.x + 8, second.y + second.height / 2 + 10, { steps: 30 });
  await page.mouse.up();
  await expect.poll(async () => position(await records(page, request), "layers-source", graphB)).not.toEqual(position(before, "layers-source", graphB));
  const after = await records(page, request);
  expect(position(after, "layers-source", "file:src/repository.ts")).not.toEqual(position(before, "layers-source", "file:src/repository.ts"));
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => position(await records(page, request), "layers-source", graphA)).toEqual(position(before, "layers-source", graphA));
  expect(position(await records(page, request), "layers-source", graphB)).toEqual(position(before, "layers-source", graphB));
});

for (const mode of ["Domain", "Combined", "Planes"]) test(`${mode}: passing over a neighbor restores its original position before release`, async ({ page, request }) => {
  await page.goto(`/p/${project}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: mode, exact: true }).click();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  const stage = mode === "Planes" ? page.locator('[data-plane="domain"]') : page.locator('.canvas-stage');
  const a = stage.getByRole("button", { name: "concept: Order", exact: true });
  const b = stage.getByRole("button", { name: "concept: Order Line", exact: true });
  await expect(a).toBeVisible(); await expect(b).toBeVisible();
  const scope = mode === "Planes" ? "layers-domain" : mode === "Combined" ? "combined" : "domain";
  const before = await records(page, request, scope);
  if (mode !== "Planes") await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const first = (await a.boundingBox())!, second = (await b.boundingBox())!;
  const style = await transform(b);
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 15 });
  await expect.poll(() => transform(b)).not.toBe(style);
  await page.mouse.move(second.x + second.width + first.width + 80, second.y + 140, { steps: 15 });
  await expect.poll(() => transform(b)).toBe(style);
  // Revisit the same position: the second preview must have the same extent.
  const peaks: string[] = [];
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 15 });
    await expect.poll(() => transform(b)).not.toBe(style);
    peaks.push(await settledTransform(b));
    await page.mouse.move(second.x + second.width + first.width + 80, second.y + 140, { steps: 15 });
    await expect.poll(() => transform(b)).toBe(style);
  }
  expect(peaks[0]).not.toBe(style);
  expect(peaks[1]).toBe(peaks[0]);
  await page.mouse.up();
  await expect.poll(async () => position(await records(page, request), scope, "item:order")).not.toEqual(position(before, scope, "item:order"));
  expect(position(await records(page, request), scope, "item:order-line")).toEqual(position(before, scope, "item:order-line"));
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => position(await records(page, request), scope, "item:order")).toEqual(position(before, scope, "item:order"));
});

for (const skin of ["Standard", "Atlas · Ink"]) test(`${skin}: an expanding context shoves another context with its children`, async ({ page, request }, info) => {
  await writeFile(join(root, "lexicon/model.xml"), xml.replace("</lexicon>",
    '<context id="delivery"><name>Delivery</name><description>Delivery.</description><concept id="parcel"><name>Parcel</name><description>A parcel.</description></concept></context></lexicon>'));
  await page.goto(`/p/${project}`);
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await page.getByRole("radio", { name: skin, exact: true }).check();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await records(page, request);
  const saved = await (await request.get(`/api/projects/${project}/canvas`)).json();
  const shapes = Object.values(saved.document.snapshot.store) as any[];
  const find = (id: string) => shapes.find(r => r.type === "lexicon-object" && r.meta.lexiconProjection === "domain" && r.props.graphId === `item:${id}`);
  Object.assign(find("ordering"), { x: 0, y: 0 });
  Object.assign(find("order"), { x: 40, y: 80 });
  Object.assign(find("order-line"), { x: 40, y: 250 });
  Object.assign(find("delivery"), { x: 500, y: 0 });
  Object.assign(find("parcel"), { x: 40, y: 80 });
  expect((await request.put(`/api/projects/${project}/canvas`, { data: { revision: saved.revision, document: saved.document } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const before = await records(page, request);
  const stage = page.locator('.canvas-stage');
  const label = (await stage.getByRole("button", { name: "concept: Order", exact: true }).boundingBox())!;
  const target = (await stage.getByRole("button", { name: "concept: Parcel", exact: true }).boundingBox())!;
  const delivery = stage.locator('[data-model-id="item:delivery"]');
  const original = (await delivery.boundingBox())!;
  await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2); await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await expect.poll(async () => (await delivery.boundingBox())!.x).toBeGreaterThan(original.x + 20);
  await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 20 });
  await expect.poll(async () => (await delivery.boundingBox())!.x).toBeCloseTo(original.x, 3);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await expect.poll(async () => (await delivery.boundingBox())!.x).toBeGreaterThan(original.x + 20);
  await settledTransform(delivery);
  await page.mouse.up();
  const outer = (await stage.locator('[data-model-id="item:ordering"]').boundingBox())!, neighbor = (await delivery.boundingBox())!;
  expect(outer.x + outer.width).toBeLessThan(neighbor.x);
  await page.screenshot({ path: info.outputPath("expanded-groups.png") });
  const after = await records(page, request);
  expect(position(after, "domain", "item:parcel")).toEqual(position(before, "domain", "item:parcel"));
  expect(position(after, "domain", "item:ordering")).toEqual(position(before, "domain", "item:ordering"));
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => position(await records(page, request), "domain", "item:delivery")).toEqual(position(before, "domain", "item:delivery"));
});

async function expectEnclosed(file: Locator, target: Locator) {
  await expect.poll(async () => {
    const outer = await file.boundingBox(), inner = await target.locator('xpath=ancestor::*[@data-source-kind="code"]').boundingBox();
    return !!outer && !!inner && inner.x >= outer.x && inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width + .1 && inner.y + inner.height <= outer.y + outer.height + .1;
  }).toBe(true);
}

for (const mode of ["Linked Sources", "Combined", "Planes"]) test(`${mode}: file boundaries follow symbols during dragging and undo`, async ({ page, request }) => {
  await page.goto(`/p/${project}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: mode, exact: true }).click();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  const stage = mode === "Planes" ? page.locator('[data-plane="source"]') : page.locator('.canvas-stage');
  const scope = mode === "Combined" ? "combined" : "layers-source";
  await records(page, request, scope);
  if (mode !== "Planes") await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const target = stage.getByRole("button", { name: "code: Order.constructor", exact: true });
  const peer = stage.getByRole("button", { name: "code: Order", exact: true });
  const file = stage.locator('[data-model-id="file:src/order.ts"]');
  const before = await records(page, request, scope);
  const graph = await target.evaluate(el => el.closest('[data-model-id]')!.getAttribute('data-model-id')!);
  // In Planes, release left of the file at row height: the upper-left point
  // belongs to the overlapping Architecture plane's Customer card.
  const moves = mode === "Planes" ? [[-130, 0], [160, 160]] : [[-130, -90], [160, 160]];
  for (const [dx, dy] of moves) {
    const start = (await target.boundingBox())!;
    // Cross-plane relationship labels can cover the symbol's text; its glyph stays exposed.
    const point = { x: start.x + 4, y: start.y + start.height / 2 };
    await expect.poll(() => target.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), point)).toBe(true);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 15 });
    await expectEnclosed(file, target);
    await expectEnclosed(file, peer);
    await page.mouse.up();
    await expectEnclosed(file, target);
    await expect.poll(async () => position(await records(page, request), scope, graph)).not.toEqual(position(before, scope, graph));
    if (mode === "Planes") await page.getByRole("button", { name: "Undo", exact: true }).click();
    else await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => position(await records(page, request), scope, graph)).toEqual(position(before, scope, graph));
    await expect.poll(async () => position(await records(page, request), scope, "file:src/order.ts")).toEqual(position(before, scope, "file:src/order.ts"));
    await expectEnclosed(file, target);
  }
});

test("saved escaped symbols get fitted file bounds despite legacy oversized dimensions", async ({ page, request }, info) => {
  await page.goto(`/p/${project}`);
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).click();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await records(page, request, "layers-source");
  const saved = await (await request.get(`/api/projects/${project}/canvas`)).json();
  const shapes = Object.values(saved.document.snapshot.store) as any[];
  const fileShape = shapes.find(r => r.type === "lexicon-object" && r.meta.lexiconProjection === "layers-source" && r.props.graphId === "file:src/order.ts");
  const rows = shapes.filter(r => r.type === "lexicon-object" && r.parentId === fileShape.id);
  fileShape.props.w = 5000; fileShape.props.h = 5000;
  for (const row of rows) row.x = -891.836;
  expect((await request.put(`/api/projects/${project}/canvas`, { data: { revision: saved.revision, document: saved.document } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const file = page.locator('.canvas-stage [data-model-id="file:src/order.ts"]');
  for (const row of rows) {
    const target = page.getByRole("button", { name: `code: ${row.meta.lexiconLabel}`, exact: true });
    await expectEnclosed(file, target);
  }
  const fitted = await file.evaluate(el => ({ w: parseFloat((el as HTMLElement).style.width), h: parseFloat((el as HTMLElement).style.height) }));
  expect(fitted.w).toBeLessThan(600);
  expect(fitted.h).toBeLessThan(600);
  const after = await records(page, request, "layers-source");
  for (const row of rows) expect(position(after, "layers-source", row.props.graphId)).toEqual(position(shapes, "layers-source", row.props.graphId));
  await page.screenshot({ path: info.outputPath("recovered-file-boundary.png") });
});
