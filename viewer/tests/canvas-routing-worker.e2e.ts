import { installRoutingProbe } from "./canvas-routing-probe";
import { expect, test } from "@playwright/test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let root: string, projectId: string;
test.beforeEach(async ({ request, page }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-routing-worker-"));
  await cp(resolve(import.meta.dirname, "../../examples/canvas-workshop"), root, { recursive: true,
    filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source) });
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBe(true);
  projectId = (await response.json()).id;
  await installRoutingProbe(page);
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${projectId}`);
  await rm(root, { recursive: true, force: true });
});

for (const skin of ["Standard", "Atlas · Ink", "Atlas · Village"]) test(`${skin} freezes unrelated edges through a paused drag and rejects late worker replies`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: skin, exact: true }).check();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  expect(page.workers().some(worker => worker.url().includes("routing.worker"))).toBe(true);
  const remote = skin === "Standard"
    ? page.locator('.canvas-connection:has([data-connection-id="relation:calculates"]) [data-route-current]')
    : page.locator('[data-map-road="relation:calculates"] [data-route-current]');
  const incident = skin === "Standard"
    ? page.locator('.canvas-connection:has([data-connection-id="relation:contains"]) [data-route-current]')
    : page.locator('[data-map-road="relation:contains"] [data-route-current]');
  await expect(remote).toHaveCount(1);
  const geometry = () => remote.evaluate(el => [...el.querySelectorAll("path")].map(p => p.getAttribute("d")));
  const before = await geometry();
  const node = page.locator('[data-model-id="item:order"]');
  const box = (await node.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const requests = await page.evaluate(() => (window as any).routingProbe.requests);
  const profiler = await page.context().newCDPSession(page);
  await profiler.send("Profiler.enable");
  await profiler.send("Profiler.start");
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 90, y + 60, { steps: 8 });
  // Longer than the removed 80 ms routing timer and 60 ms morph timer.
  await page.waitForTimeout(250);
  expect(await geometry()).toEqual(before);
  expect(await page.evaluate(() => (window as any).routingProbe.requests)).toBe(requests);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  expect((await node.boundingBox())!.x - box.x).toBeGreaterThan(60);
  const { profile } = await profiler.send("Profiler.stop");
  const profilePath = info.outputPath("drag.cpuprofile");
  await writeFile(profilePath, JSON.stringify(profile));
  await info.attach("drag-cpu-profile", { path: profilePath, contentType: "application/json" });
  await profiler.detach();
  await page.screenshot({ path: info.outputPath("drag-preview.png") });
  // Delay a settled result, then start a new gesture before it reaches the client.
  await page.evaluate(() => { (window as any).routingProbe.delay = 350; });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.requests)).toBeGreaterThan(requests);
  const moved = (await node.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(x + 140, y + 95, { steps: 5 });
  // Preview writes and React paint settle on the next animation frames.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const during = await geometry();
  const attached = await incident.locator("path").first().getAttribute("d");
  const requestsDuring = await page.evaluate(() => (window as any).routingProbe.requests);
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  expect(await geometry()).toEqual(during);
  expect(await incident.locator("path").first().getAttribute("d")).toBe(attached);
  expect(await page.evaluate(() => (window as any).routingProbe.requests)).toBe(requestsDuring);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  await page.evaluate(() => { (window as any).routingProbe.delay = 0; });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("settled-routing.png") });
  const settled = (await node.boundingBox())!;
  await page.mouse.move(settled.x + settled.width / 2, settled.y + settled.height / 2);
  await page.mouse.down();
  await page.mouse.move(settled.x + settled.width / 2 + 60, settled.y + settled.height / 2 + 40, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(async () => (await node.boundingBox())!.x).toBeCloseTo(settled.x, 1);
  await expect.poll(async () => (await node.boundingBox())!.y).toBeCloseTo(settled.y, 1);
  expect(errors).toEqual([]);
});

test("300 concepts and 280 relationships drag without submitting route searches", async ({ page }, info) => {
  const contexts = Array.from({ length: 20 }, (_, c) => `<context id="c${c}"><name>Context ${c}</name><description>Drag benchmark.</description>${Array.from({ length: 15 }, (_, n) =>
    `<concept id="c${c}n${n}"><name>Concept ${c} ${n}</name><description>Benchmark concept.</description></concept>`).join("")}</context>`).join("");
  const relations = Array.from({ length: 20 }, (_, c) => Array.from({ length: 14 }, (_, n) =>
    `<relationship id="r${c}n${n}" from="c${c}n${n}" to="c${c}n${n + 1}"><name>feeds</name><description>Benchmark connection.</description></relationship>`).join("")).join("");
  await writeFile(join(root, "lexicon/model.xml"), `<lexicon schema="3.3" id="routing-benchmark"><name>Routing benchmark</name><description>Large drag scene.</description>${contexts}${relations}</lexicon>`);
  await page.goto(`/p/${projectId}?item=c0n0`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Locate", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  const node = page.locator('[data-model-id="item:c0n0"]');
  const box = (await node.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const requests = await page.evaluate(() => (window as any).routingProbe.requests);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.evaluate(() => {
    const state = (window as any).dragFrames = { frames: [] as number[], last: 0, frame: 0 };
    const tick = (now: number) => {
      if (state.last) state.frames.push(now - state.last);
      state.last = now; state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
  });
  await page.mouse.move(x + 80, y + 50, { steps: 40 });
  await page.mouse.move(x + 30, y + 20, { steps: 40 });
  const frames = await page.evaluate(() => {
    const state = (window as any).dragFrames;
    cancelAnimationFrame(state.frame);
    return (state.frames as number[]).sort((a, b) => a - b);
  });
  expect((await node.boundingBox())!.x).not.toBeCloseTo(box.x, 0);
  expect(await page.evaluate(() => (window as any).routingProbe.requests)).toBe(requests);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  const timing = { frames: frames.length, medianMs: frames[Math.floor(frames.length * .5)],
    p95Ms: frames[Math.floor(frames.length * .95)], maxMs: frames.at(-1) };
  console.log("Worker routing: 300-concept drag frames", JSON.stringify(timing));
  await info.attach("drag-frame-times", { body: JSON.stringify(timing, null, 2), contentType: "application/json" });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
});

test("automatic recovery and saving wait through a paused drag, then persist release", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).recoveryWrites = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'drafts') (window as any).recoveryWrites++;
      return put.apply(this, args);
    };
  });
  let saves = 0;
  page.on('request', r => { if (r.method() === 'PUT' && r.url().endsWith('/canvas')) saves++; });
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.waitForTimeout(400); // Let the preceding camera-session recovery finish.
  const node = page.locator('[data-model-id="item:order"]');
  const b = (await node.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 40, { steps: 5 });
  const before = await page.evaluate(() => (window as any).recoveryWrites), saved = saves;
  await page.waitForTimeout(900); // Cross both recovery and project-autosave deadlines while held.
  expect(await page.evaluate(() => (window as any).recoveryWrites)).toBe(before);
  expect(saves).toBe(saved);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).recoveryWrites)).toBeGreaterThan(before);
  await expect.poll(() => saves).toBeGreaterThan(saved);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  const moved = (await node.boundingBox())!;
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(async () => (await node.boundingBox())!.x).toBeCloseTo(moved.x, 1);
});

test("returning to a plane preserves settled paths while its routing worker restarts", async ({ page }) => {
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  const paths = () => page.locator('.canvas-connection').evaluateAll(elements => Object.fromEntries(elements.map(element => [
    element.querySelector('[data-connection-id]')?.getAttribute('data-connection-id'),
    element.querySelector('[data-route-current] > path')?.getAttribute('d'),
  ])));
  const initial = await paths();
  expect(Object.keys(initial).length).toBeGreaterThan(0);
  await page.getByRole('radio', { name: 'Architecture', exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await page.evaluate(() => { (window as any).routingProbe.delay = 800; });
  await page.getByRole('radio', { name: 'Domain', exact: true }).check();
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  expect(await paths()).toEqual(initial);
  await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(await paths()).toEqual(initial);
});
