// Rasterize the existing vector brand mark; run again when the SVGs change.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../client/public");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chromium" });
try {
  const page = await browser.newPage();
  for (const [source, target, size] of [
    ["icon.svg", "icon-192.png", 192],
    ["icon.svg", "icon-512.png", 512],
    ["icon-maskable.svg", "icon-maskable-512.png", 512],
    ["icon-maskable.svg", "apple-touch-icon.png", 180],
  ] as const) {
    const svg = await readFile(resolve(root, source), "utf8");
    const data = await page.evaluate(async ({ svg, size }) => {
      const image = new Image();
      image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d")!.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { svg, size });
    await writeFile(resolve(root, target), Buffer.from(data, "base64"));
  }
} finally {
  await browser.close();
}
