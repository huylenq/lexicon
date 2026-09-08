// Run against an isolated production server: bun scripts/reader-performance.ts http://localhost:5388
// Reports observations, not a hardware-dependent pass/fail threshold.
import { chromium } from "@playwright/test";

const baseURL = process.argv[2] || "http://localhost:5388";
const surface = process.argv[3] === "canvas" ? "canvas" : "graph";
const browser = await chromium.launch();
try {
  for (const count of [5, undefined]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const response = await page.request.get(`${baseURL}/api/projects/dentalml/model`);
    const { model } = await response.json();
    const ids = model.items.slice(0, count).map((item: { id: string }) => item.id);
    await page.addInitScript(ids => localStorage.setItem("lexicon:reader:v1:dentalml", JSON.stringify({
      cards: ids.map(id => ({ kind: "item", id })), active: `item:${ids[0]}`, visible: true, scrollTop: 0,
    })), ids);
    await page.goto(`${baseURL}/p/dentalml?canvas=${surface}&item=${ids[0]}`);
    await page.locator("[data-reader-card]").last().waitFor();
    await page.waitForTimeout(1000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Performance.enable");
    const runs = [];
    for (let run = 0; run < 3; run++) {
      const before = await cdp.send("Performance.getMetrics");
      const frames = await page.locator("main").evaluate(async el => {
        const frames: number[] = [];
        const max = el.scrollHeight - el.clientHeight;
        let start = 0, previous = 0;
        await new Promise<void>(resolve => {
          const tick = (now: number) => {
            if (!start) start = previous = now;
            else frames.push(now - previous);
            previous = now;
            const progress = Math.min(1, (now - start) / 6000);
            el.scrollTop = max * (progress < .5 ? progress * 2 : (1 - progress) * 2);
            if (progress < 1) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        return frames;
      });
      await page.waitForTimeout(500);
      const after = await cdp.send("Performance.getMetrics");
      const delta = (name: string) => (after.metrics.find(m => m.name === name)?.value || 0) - (before.metrics.find(m => m.name === name)?.value || 0);
      frames.sort((a, b) => a - b);
      runs.push({ frames: frames.length, p95ms: +frames[Math.floor(frames.length * .95)].toFixed(1),
        maxMs: +frames.at(-1)!.toFixed(1), over25ms: frames.filter(ms => ms > 25).length,
        scriptMs: Math.round(delta("ScriptDuration") * 1000), layoutMs: Math.round(delta("LayoutDuration") * 1000),
        taskMs: Math.round(delta("TaskDuration") * 1000), layouts: delta("LayoutCount") });
    }
    console.log(JSON.stringify({ surface, cards: ids.length, cpuThrottle: 4, viewport: "1600x900", runs }));
    await page.close();
  }
} finally { await browser.close(); }
