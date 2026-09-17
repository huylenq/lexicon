import { test, expect } from "@playwright/test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

for (const edgeCount of [2, 300]) test(`${edgeCount} edges: crossing hops survive reload, follow dragging, and keep presentation files unchanged`, async ({ page, request }, info) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-hops-"));
  let id: string | undefined;
  try {
    await cp(resolve(import.meta.dirname, "../../examples/canvas-workshop"), root, { recursive: true,
      filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source) });
    const original = await readFile(join(root, "lexicon/model.xml"), "utf8");
    id = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await page.goto(`/p/${id}`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
    await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await page.getByRole("radio", { name: "Domain", exact: true }).check();
    await page.getByRole("radio", { name: "Standard", exact: true }).check();
    await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
    let saved: any;
    await expect.poll(async () => {
      saved = await (await request.get(`/api/projects/${id}/canvas`)).json();
      return !!saved.document;
    }).toBe(true);
    const document = saved.document, records = Object.values(document.snapshot.store) as any[];
    const source = records.find(r => r.type === "lexicon-connection" && r.props.graphId === "relation:contains");
    // Authored copies provide a deterministic crossing, independent of auto-routing.
    for (let pair = 0; pair < edgeCount / 2; pair++) for (const [name, points, labelX, labelY] of [
      ["horizontal", [{ x: 0, y: 100 }, { x: 300, y: 100 }], 40, 100],
      ["vertical", [{ x: 150, y: 0 }, { x: 150, y: 200 }], 150, 20],
    ] as const) {
      const copy = { ...source, id: `shape:hop-${name}${pair ? `-${pair}` : ""}`, parentId: source.parentId,
        x: -400 + pair % 15 * 400, y: 700 + Math.floor(pair / 15) * 300, index: name === "horizontal" ? "a9" : "aA", props: { ...source.props, points,
          path: points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "), labelX, labelY, labelWidth: 60 } };
      document.snapshot.store[copy.id] = copy;
    }
    if (edgeCount === 2) for (const [name, points, labelX, labelY] of [
      ["rounded", [{ x: 0, y: 240 }, { x: 200, y: 240 }, { x: 200, y: 0 }], 20, 240],
      ["rounded-under", [{ x: 175, y: 0 }, { x: 175, y: 300 }], 175, 20],
    ] as const) {
      const copy = { ...source, id: `shape:hop-${name}`, parentId: source.parentId,
        x: -400, y: 1000, index: name === "rounded" ? "aB" : "aC", props: { ...source.props, points,
          path: points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "), labelX, labelY, labelWidth: 60 } };
      document.snapshot.store[copy.id] = copy;
    }
    if (edgeCount === 2) for (const [name, path, points] of [
      ["crowded-horizontal", "M 0 100 L 300 100", [{ x: 0, y: 100 }, { x: 300, y: 100 }]],
      ["crowded-vertical", "M 150 0 L 150 200", [{ x: 150, y: 0 }, { x: 150, y: 200 }]],
      ["crowded-curve", "M 0 95 Q 150 95 300 95", [{ x: 0, y: 95 }, { x: 300, y: 95 }]],
    ] as const) {
      const copy = { ...source, id: `shape:hop-${name}`, parentId: source.parentId,
        x: -400, y: 1400, index: "aD", props: { ...source.props, path, points, labelX: -100, labelY: -50, labelWidth: 60 } };
      document.snapshot.store[copy.id] = copy;
    }
    const validation = await request.post(`/api/projects/${id}/canvas/validate`, { data: document });
    expect(validation.ok(), await validation.text()).toBeTruthy();
    await page.locator('input[aria-label="Restore canvas file"]').setInputFiles({ name: "canvas.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect(page.locator('[data-shape-id="shape:hop-horizontal"]')).toBeAttached();
    await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
    await page.mouse.click(700, 700);
    await page.keyboard.press("Shift+1");
    const h = page.locator('[data-shape-id="shape:hop-horizontal"] [data-route-current] > path').first();
    const v = page.locator('[data-shape-id="shape:hop-vertical"] [data-route-current] > path').first();
    await expect(h).toHaveAttribute("d", /Q 144 94 150 94 Q 156 94 156 100/);
    await expect(v).toHaveAttribute("d", /L 150 91\.5 M 150 96\.5/);
    await page.getByLabel("Edge appearance", { exact: true }).click();
    const toggle = page.getByRole("checkbox", { name: /Crossing hops/ });
    await expect(toggle).toBeChecked();
    await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
    const canvas = await readFile(join(root, "lexicon/canvas.json"), "utf8");
    await toggle.uncheck();
    await expect(h).not.toHaveAttribute("d", /Q/);
    await expect(v).toHaveAttribute("d", "M 150 0 L 150 200");
    await page.reload();
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await page.getByLabel("Edge appearance", { exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(h).toHaveAttribute("d", /Q/);
    expect(await readFile(join(root, "lexicon/canvas.json"), "utf8")).toBe(canvas);
    if (edgeCount === 2) {
      await expect(page.locator('[data-shape-id="shape:hop-crowded-horizontal"] [data-route-current] > path').first())
        .toHaveAttribute("d", "M 0 100 L 300 100");
      await expect(page.locator('[data-shape-id="shape:hop-crowded-vertical"] [data-route-current] > path').first())
        .toHaveAttribute("d", /L 150 92\.5 M 150 97\.5/);
      const radius = page.getByRole("slider", { name: "Corner radius", exact: true });
      await radius.focus(); await radius.press("End");
      const rounded = page.locator('[data-shape-id="shape:hop-rounded"] [data-route-current] > path').first();
      const under = page.locator('[data-shape-id="shape:hop-rounded-under"] [data-route-current] > path').first();
      await expect(rounded).toHaveAttribute("d", /Q 200 240 200 140/);
      await expect.poll(() => under.evaluate(el => {
        const path = el.getAttribute("d")!;
        const gap = path.match(/L 175 ([\d.]+) M 175 ([\d.]+)/);
        return gap ? (Number(gap[1]) + Number(gap[2])) / 2 : null;
      })).toBeCloseTo(215, 6);
      const originalCurve = await rounded.getAttribute("d");
      await toggle.uncheck();
      await expect(under).toHaveAttribute("d", "M 175 0 L 175 300");
      await expect(rounded).toHaveAttribute("d", originalCurve!);
      await toggle.check();
      await expect(under).toHaveAttribute("d", /L 175 [\d.]+ M 175 [\d.]+/);
      await page.screenshot({ path: info.outputPath("rounded-crossing.png") });
      await radius.focus(); await radius.press("Home");
    }
    await page.screenshot({ path: info.outputPath("edge-hops.png") });
    await toggle.press("Escape");
    const point = await v.evaluate(el => new DOMPoint(150, 170).matrixTransform((el as SVGPathElement).getScreenCTM()!).toJSON());
    if (edgeCount === 300) {
      const timings = [];
      for (const enabled of [false, true, false, true]) {
        await page.getByLabel("Edge appearance", { exact: true }).click();
        await toggle.setChecked(enabled);
        await toggle.press("Escape");
        await page.evaluate(() => {
          const sample = { frames: [] as number[], last: 0, frame: 0 };
          (window as any).__hopFrames = sample;
          const tick = (now: number) => { if (sample.last) sample.frames.push(now - sample.last); sample.last = now; sample.frame = requestAnimationFrame(tick); };
          sample.frame = requestAnimationFrame(tick);
        });
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        await page.mouse.move(point.x + 80, point.y + 30, { steps: 40 });
        await page.mouse.move(point.x, point.y, { steps: 40 }); await page.mouse.up();
        const frames = await page.evaluate(() => {
          const sample = (window as any).__hopFrames; cancelAnimationFrame(sample.frame); delete (window as any).__hopFrames;
          return sample.frames as number[];
        });
        frames.sort((a, b) => a - b);
        timings.push({ enabled, frames: frames.length, medianMs: frames[Math.floor(frames.length * .5)], p95Ms: frames[Math.floor(frames.length * .95)], maxMs: frames.at(-1) });
      }
      await info.attach("drag-frame-times", { body: JSON.stringify(timings, null, 2), contentType: "application/json" });
      console.log("300-edge drag frames", JSON.stringify(timings));
      await expect(h).toHaveAttribute("d", /Q/);
    } else {
      // Observe the real SVG export before PNG rasterization; omitted edges
      // must leave neither a gap nor an orphan bridge in the exported route.
      await page.evaluate(() => {
        (window as any).__exportPaths = [];
        const observer = new MutationObserver(() => {
          const paths = [...document.querySelectorAll('.tldraw-svg-export path')].map(el => el.getAttribute("d"));
          if (paths.length) (window as any).__exportPaths = paths;
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["d"] });
        (window as any).__exportObserver = observer;
      });
      const selectPoint = await v.evaluate(el => new DOMPoint(150, 170).matrixTransform((el as SVGPathElement).getScreenCTM()!).toJSON());
      await page.mouse.click(selectPoint.x, selectPoint.y);
      await page.getByRole("button", { name: "Selection actions", exact: true }).click();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export selection", exact: true }).click();
      await (await download).saveAs(info.outputPath("edge-hop-export.png"));
      const exportedPaths = await page.evaluate(() => {
        (window as any).__exportObserver.disconnect();
        return (window as any).__exportPaths as string[];
      });
      expect(exportedPaths).toContain("M 150 0 L 150 200");
      expect(exportedPaths.some(path => /L 150 91\.5 M/.test(path))).toBe(false);
      await expect(v).toHaveAttribute("d", /L 150 91\.5 M 150 96\.5/);
      await page.mouse.click(500, 150);
    }
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 260, point.y, { steps: 16 });
    await page.mouse.up();
    await expect(h).not.toHaveAttribute("d", /Q/);
    await page.setViewportSize({ width: 600, height: 850 });
    const readerToggle = page.getByRole("button", { name: "Toggle reader", exact: true });
    if (await readerToggle.getAttribute("aria-pressed") === "true") await readerToggle.click();
    await page.getByLabel("Edge appearance", { exact: true }).click();
    await expect(toggle).toBeVisible();
    const box = (await page.locator(".edge-appearance-popover").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(600);
    await page.screenshot({ path: info.outputPath("edge-hops-narrow.png") });
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
