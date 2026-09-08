import { expect, type Page } from "@playwright/test";
import { uncoveredArea } from "./canvas-polygon-oracle";

/** Read the actual rendered world-space coastline, independent of its generation. */
export async function renderedTerritory(page: Page, id = "ordering") {
  const d = await page.locator(`[data-map-district="item:${id}"] .map-district`).getAttribute("d");
  const numbers = d!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
  return numbers.flatMap((x, i) => i % 2 ? [] : [{ x, y: numbers[i + 1] }]);
}
export async function territoryScreenPoint(page: Page, point: { x: number; y: number }, id = "ordering") {
  return page.locator(`[data-map-district="item:${id}"] .map-district`).evaluate((element, p) => {
    const at = new DOMPoint(p.x, p.y).matrixTransform((element as SVGPathElement).getScreenCTM()!);
    return { x: at.x, y: at.y };
  }, point);
}
export async function atlasEnclosesNodes(page: Page, ids = ["order", "order-line", "order-total"], context = "ordering") {
  const points = await renderedTerritory(page, context);
  const boxes = await page.locator(`[data-map-district="item:${context}"] .map-district`).evaluate((element, ids) => {
    const transform = (element as SVGPathElement).getScreenCTM()!.inverse();
    return ids.map(id => {
      const box = document.querySelector(`[data-model-id="item:${id}"]`)!.getBoundingClientRect();
      const a = new DOMPoint(box.x, box.y).matrixTransform(transform);
      const b = new DOMPoint(box.right, box.bottom).matrixTransform(transform);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    });
  }, ids);
  for (const box of boxes) expect(uncoveredArea(points, box)).toBeLessThan(.001);
}
