// Production Canvas trace. Arguments: server URL, output prefix, optional model.xml.
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, copyFile, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

const baseURL = process.argv[2] || "http://localhost:5388";
const output = process.argv[3] || "/tmp/reader-canvas";
const browser = await chromium.launch();
let root: string | undefined;
let projectId = "dentalml";
let unregister: (() => Promise<unknown>) | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  if (process.argv[4]) {
    root = await mkdtemp(join(tmpdir(), "lexicon-reader-trace-"));
    await mkdir(join(root, "lexicon"));
    await copyFile(process.argv[4], join(root, "lexicon/model.xml"));
    const registered = await page.request.post(`${baseURL}/api/projects`, { data: { root } });
    if (!registered.ok()) throw new Error(await registered.text());
    projectId = (await registered.json()).id;
    unregister = () => page.request.delete(`${baseURL}/api/projects/${projectId}`);
  }
  const { model } = await (await page.request.get(`${baseURL}/api/projects/${projectId}/model`)).json();
  const ids: string[] = model.items.filter((item: { type: string }) => item.type === "concept").slice(0, 24).map((item: { id: string }) => item.id);
  await page.addInitScript(({ ids, projectId }) => localStorage.setItem(`lexicon:reader:v1:${projectId}`, JSON.stringify({
    cards: ids.map(id => ({ kind: "item", id })), active: `item:${ids[0]}`, visible: true, scrollTop: 0,
  })), { ids, projectId });
  await page.goto(`${baseURL}/p/${projectId}?item=${ids[0]}`);
  await page.locator(".tl-container").waitFor();
  await page.locator("[data-reader-card]").last().waitFor();
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  await cdp.send("Tracing.start", { transferMode: "ReturnAsStream", categories: "devtools.timeline,blink.user_timing,v8,disabled-by-default-devtools.timeline.stack" });
  const phases: unknown[] = [];
  for (const phase of ["bottom-morph", "top-morph", "rows-down", "rows-up"]) {
    phases.push(await page.locator("main").evaluate(async (main, phase) => {
      const card = main.querySelectorAll<HTMLElement>("[data-reader-card]")[Math.min(5, main.querySelectorAll("[data-reader-card]").length - 1)];
      const max = main.scrollHeight - main.clientHeight;
      const start = phase === "bottom-morph" ? card.offsetTop - main.clientHeight + 50
        : phase === "top-morph" ? card.offsetTop + card.offsetHeight - 380 : phase === "rows-down" ? 0 : max;
      const end = phase.endsWith("morph") ? start + 360 : phase === "rows-down" ? max : 0;
      main.scrollTop = Math.max(0, start);
      await new Promise(resolve => setTimeout(resolve, 500));
      performance.mark(`${phase}:start`);
      const frames: number[] = [];
      let began = 0, previous = 0;
      await new Promise<void>(resolve => {
        const tick = (now: number) => {
          if (!began) began = previous = now;
          else frames.push(now - previous);
          previous = now;
          const t = Math.min(1, (now - began) / (phase.endsWith("morph") ? 2400 : 3600));
          main.scrollTop = Math.max(0, start + (end - start) * t);
          if (t < 1) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      performance.mark(`${phase}:scroll-end`);
      await new Promise(resolve => setTimeout(resolve, 600));
      performance.mark(`${phase}:end`);
      frames.sort((a, b) => a - b);
      return { phase, frames: frames.length, p95ms: +frames[Math.floor(frames.length * .95)].toFixed(1), over25ms: frames.filter(ms => ms > 25).length };
    }, phase));
  }
  await page.evaluate(() => performance.mark("navigation:start"));
  await page.locator(`[data-bottom-card="item:${ids.at(-1)}"] .reader-card-title`).click();
  await page.waitForFunction(() => !document.querySelector("main[data-reader-travel]"));
  await page.waitForTimeout(600);
  await page.evaluate(() => performance.mark("navigation:end"));
  const completed = new Promise<any>(resolve => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  const { stream } = await completed;
  let raw = "";
  for (;;) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    raw += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  const { profile } = await cdp.send("Profiler.stop");
  await writeFile(`${output}.trace.json`, raw);
  await writeFile(`${output}.cpuprofile`, JSON.stringify(profile));
  await page.screenshot({ path: `${output}.png` });
  const events = JSON.parse(raw).traceEvents;
  const main = events.find((event: any) => event.name === "thread_name" && event.args.name === "CrRendererMain");
  const regions = Object.fromEntries([
    ...["bottom-morph", "top-morph", "rows-down", "rows-up"].flatMap(phase => [
      [phase, `${phase}:start`, `${phase}:scroll-end`],
      [`${phase}-settle`, `${phase}:scroll-end`, `${phase}:end`],
    ]),
    ["navigation", "navigation:start", "navigation:end"],
  ].map(([name, from, to]) => {
    const start = events.find((event: any) => event.name === from)?.ts;
    const end = events.find((event: any) => event.name === to)?.ts;
    const region: Record<string, number> = { elapsedMs: (end - start) / 1000 };
    for (const type of ["UpdateLayoutTree", "Layout", "Paint"]) {
      region[type] = events.filter((event: any) => event.name === type && event.ph === "X" &&
        event.pid === main?.pid && event.tid === main?.tid && event.ts >= start && event.ts < end)
        .reduce((sum: number, event: any) => sum + event.dur / 1000, 0);
    }
    return [name, region];
  }));
  const totals: Record<string, { count: number; ms: number; maxMs: number }> = {};
  for (const event of events) {
    if (event.ph !== "X" || event.tid !== main?.tid || event.pid !== main?.pid || !event.dur) continue;
    const total = totals[event.name] ||= { count: 0, ms: 0, maxMs: 0 };
    total.count++; total.ms += event.dur / 1000; total.maxMs = Math.max(total.maxMs, event.dur / 1000);
  }
  const samples = new Map<number, number>();
  profile.samples?.forEach((id, index) => samples.set(id, (samples.get(id) || 0) + (profile.timeDeltas?.[index] || 0) / 1000));
  const maps = new Map<string, TraceMap | null>();
  const functions = [];
  for (const node of profile.nodes) {
    if (!samples.has(node.id)) continue;
    const frame = node.callFrame;
    if (frame.url.includes("/assets/") && !maps.has(frame.url)) {
      try { maps.set(frame.url, new TraceMap(await readFile(join(import.meta.dirname, "../client/dist/assets", `${basename(frame.url)}.map`), "utf8"))); }
      catch { maps.set(frame.url, null); }
    }
    const map = maps.get(frame.url);
    const original = map ? originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber }) : undefined;
    functions.push({ ms: samples.get(node.id), name: original?.name || frame.functionName, source: original?.source || frame.url, line: original?.line || frame.lineNumber + 1 });
  }
  const summary = { model: model.name, modelItems: model.items.length, cards: ids.length, cpuThrottle: 4, phases, regions,
    mainThread: Object.fromEntries(Object.entries(totals).sort((a, b) => b[1].ms - a[1].ms).slice(0, 22)),
    functions: functions.sort((a, b) => b.ms! - a.ms!).slice(0, 40) };
  await writeFile(`${output}.summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  await unregister?.().catch(() => {});
  await browser.close();
  if (root) await rm(root, { recursive: true, force: true });
}
