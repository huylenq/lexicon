import { expect, test, type Page } from "@playwright/test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { installRoutingProbe } from "./canvas-routing-probe";

let root: string, projectId: string;
test.beforeEach(async ({ request, page }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-routing-lifecycle-"));
  await cp(resolve(import.meta.dirname, "../../examples/canvas-workshop"), root, {
    recursive: true, filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source),
  });
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBe(true);
  projectId = (await response.json()).id;
  await installRoutingProbe(page);
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${projectId}`);
  await rm(root, { recursive: true, force: true });
});

async function open(page: Page, architecture = false) {
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  if (architecture) await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await page.getByRole("radio", { name: "Standard", exact: true }).check();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
}

test("dragging a nested component updates connections on every fitted ancestor", async ({ page }) => {
  await writeFile(join(root, "lexicon/model.xml"), `<lexicon schema="3.3" id="nested-routing">
    <name>Nested routing</name><description>Derived endpoint regression.</description>
    <system id="system"><name>System</name><description>Outer frame.</description>
      <container id="container"><name>Container</name><description>Inner frame.</description>
        <component id="component"><name>Component</name><description>Movable child.</description></component>
      </container>
    </system>
    <person id="external"><name>External</name><description>Other endpoint.</description></person>
    <relationship id="outer" from="system" to="external"><name>serves</name><description>Outer connection.</description></relationship>
    <relationship id="inner" from="container" to="external"><name>handles</name><description>Inner connection.</description></relationship>
  </lexicon>`);
  await open(page, true);
  const node = page.locator('[data-model-id="item:component"]');
  const endpoint = (id: string) => page.locator(`.canvas-connection:has([data-connection-id="relation:${id}"]) [data-route-current] path`).first().evaluate(path => {
    const p = (path as SVGPathElement).getPointAtLength(0);
    return new DOMPoint(p.x, p.y).matrixTransform((path as SVGPathElement).getScreenCTM()!).toJSON();
  });
  const before = await Promise.all([endpoint("outer"), endpoint("inner")]);
  const b = (await node.boundingBox())!;
  const requests = await page.evaluate(() => (window as any).routingProbe.requests);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 100, b.y + b.height / 2 - 90, { steps: 12 });
  for (const [i, id] of ["outer", "inner"].entries()) {
    await expect.poll(async () => {
      const after = await endpoint(id);
      return Math.hypot(after.x - before[i].x, after.y - before[i].y);
    }).toBeGreaterThan(10);
  }
  expect(await page.evaluate(() => (window as any).routingProbe.requests)).toBe(requests);
  await page.mouse.up();
});

test("final routing resumes after its reply arrives during a camera drag", async ({ page }) => {
  await open(page);
  const node = page.locator('[data-model-id="item:order"]');
  const b = (await node.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 40, { steps: 8 });
  const requests = await page.evaluate(() => { (window as any).routingProbe.delay = 500; return (window as any).routingProbe.requests; });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.requests)).toBeGreaterThan(requests);
  // Space-drag changes the camera only, so no model-shape dirty event can
  // accidentally repair the discarded routing job for us.
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 115, b.y + b.height / 2 + 65, { steps: 5 });
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  const during = await page.evaluate(() => { (window as any).routingProbe.delay = 0; return (window as any).routingProbe.requests; });
  await page.mouse.up(); await page.keyboard.up("Space");
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.requests)).toBeGreaterThan(during);
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
});
