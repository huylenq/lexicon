import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
let root: string, projectId: string, original: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-canvas-test-"));
  await cp(resolve(import.meta.dirname, "../../examples/canvas-workshop"), root, { recursive: true,
    filter: (source) => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source),
  });
  original = await readFile(join(root, "lexicon/model.xml"), "utf8");
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBeTruthy();
  projectId = (await response.json()).id;
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${projectId}`);
  await rm(root, { recursive: true, force: true });
});
async function open(page: Page) {
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
}

for (const skin of ["Standard", "Atlas · Ink", "Atlas · Village"]) test(`${skin} morphs one opaque route and stays still across idle polls`, async ({ page, request }) => {
  await open(page);
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await page.getByRole("radio", { name: skin, exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  const routeSelector = skin === "Standard"
    ? '.canvas-connection:has([data-connection-id="relation:contains"]) [data-route-current]'
    : '[data-map-road="relation:contains"] [data-route-current]';
  const route = page.locator(routeSelector);
  await expect(route).toHaveCount(1);
  await page.evaluate(selector => {
    const group = document.querySelector(selector)!;
    (window as any).routeSamples = [];
    (window as any).routeOpacity = [];
    (window as any).endpointExcursion = 0;
    let releasedAt = -Infinity, releasedPoint: DOMPoint | undefined;
    const endpoint = () => {
      const path = group.querySelector("path") as SVGPathElement;
      return path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
    };
    document.addEventListener("pointerup", () => { releasedAt = performance.now(); releasedPoint = endpoint(); });
    const sample = () => {
      if (group.hasAttribute("data-route-morphing")) {
        (window as any).routeSamples.push(group.querySelector("path")!.getAttribute("d"));
        (window as any).routeOpacity.push(getComputedStyle(group).opacity);
      }
      if (releasedPoint && performance.now() - releasedAt < 250) {
        const p = endpoint();
        (window as any).endpointExcursion = Math.max((window as any).endpointExcursion, Math.hypot(p.x - releasedPoint.x, p.y - releasedPoint.y));
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, routeSelector);
  const node = page.locator('[data-model-id="item:order"]');
  const box = (await node.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const before = await route.locator("path").first().getAttribute("d");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 300, y + 180, { steps: 3 });
  // Interrupt an active morph with a second route while the pointer is still down.
  await page.mouse.move(x + 240, y + 120, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  const after = await route.locator("path").first().getAttribute("d");
  const samples = await page.evaluate(() => ({ paths: (window as any).routeSamples as string[], opacity: (window as any).routeOpacity as string[] }));
  expect(new Set(samples.paths.filter(d => d !== before && d !== after)).size).toBeGreaterThan(2);
  expect(new Set(samples.opacity)).toEqual(new Set(["1"]));
  if (skin === "Standard") expect(await page.evaluate(() => (window as any).endpointExcursion)).toBeLessThan(.5);
  await expect(route).toHaveCount(1);
  await expect(page.locator('.route-outgoing, .route-incoming')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read relationship: contains", exact: true })).toHaveCount(1);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  // A new server revision with identical contents must not reinstall the canvas.
  let polls = 0;
  await page.route(`**/api/projects/${projectId}/canvas`, async intercepted => {
    if (intercepted.request().method() !== "GET") return intercepted.continue();
    const response = await intercepted.fetch();
    const body = await response.json();
    polls++;
    await intercepted.fulfill({ response, json: { ...body, revision: `idle-revision-${polls}` } });
  });
  await page.evaluate(() => {
    (window as any).idleChanges = 0;
    new MutationObserver(records => {
      (window as any).idleChanges += records.filter(r => {
        const target = r.target instanceof Element ? r.target : r.target.parentElement;
        const drawing = target?.closest(".tl-shape, .canvas-map");
        const replacesDrawing = [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element && (n.matches(".tl-shape, .canvas-map") || n.querySelector(".tl-shape, .canvas-map")));
        return r.attributeName === "data-ready" || replacesDrawing || (drawing && (r.type === "childList" || ["d", "opacity", "data-route-morphing"].includes(r.attributeName || "")));
      }).length;
    }).observe(document.querySelector(".canvas-stage")!, { subtree: true, childList: true, attributes: true });
  });
  await expect.poll(() => polls, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as any).idleChanges)).toBe(0);
  await page.unroute(`**/api/projects/${projectId}/canvas`);
  // A real edit from another client must still be installed by the next poll.
  const remote = await (await request.get(`/api/projects/${projectId}/canvas`)).json();
  const remoteNode = Object.values(remote.document.snapshot.store).find((r: any) => r.type === "lexicon-object" && r.props.graphId === "item:order") as any;
  remoteNode.x += 80;
  const positionBeforeRemote = (await node.boundingBox())!.x;
  expect((await request.put(`/api/projects/${projectId}/canvas`, { data: { revision: remote.revision, document: remote.document } })).ok()).toBe(true);
  await expect.poll(async () => (await node.boundingBox())!.x, { timeout: 10_000 }).not.toBe(positionBeforeRemote);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { (window as any).routeSamples = []; });
  const moved = (await node.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).routeSamples)).toEqual([]);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});


test("a copied connector keeps its local geometry while being dragged", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await page.getByRole("radio", { name: "Standard", exact: true }).check();
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "Read relationship: contains", exact: true }).click();
  await page.keyboard.press("Meta+d");
  await expect(page.locator('[data-connection-id="relation:contains"]')).toHaveCount(2);
  const copy = page.locator('.canvas-connection[data-selected="true"]:has([data-connection-id="relation:contains"])');
  await expect(copy).toHaveCount(1);
  const localGeometry = () => copy.evaluate(el => ({ d: el.querySelector("path")!.getAttribute("d"),
    x: el.querySelector("foreignObject")!.getAttribute("x"), y: el.querySelector("foreignObject")!.getAttribute("y") }));
  const before = await localGeometry();
  const box = (await copy.locator("button").boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 180, y + 100, { steps: 5 });
  expect(await localGeometry()).toEqual(before);
  await expect(copy.locator('[data-route-morphing="true"]')).toHaveCount(0);
  const moved = (await copy.locator("button").boundingBox())!;
  expect(moved.x - box.x).toBeGreaterThan(100);
  await page.mouse.up();
  expect(await localGeometry()).toEqual(before);
});
