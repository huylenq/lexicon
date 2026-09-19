import { expect, test } from "bun:test";
import { agentBearing, agentPanel, agentVisible, resizeAgentPanel } from "../client/src/agentCanvas";

const viewport = { width: 1200, height: 800 };
test("off-screen bearings stay on the safe edge and point toward the task", () => {
  for (const [point, edge, angle] of [
    [{ x: -400, y: 400 }, "left", 180],
    [{ x: 1800, y: 400 }, "right", 0],
    [{ x: 600, y: -300 }, "top", -90],
    [{ x: 600, y: 1300 }, "bottom", 90],
  ] as const) {
    expect(agentVisible(point, viewport)).toBe(false);
    const bearing = agentBearing(point, viewport);
    expect(bearing.group.startsWith(edge)).toBe(true);
    expect(bearing.angle).toBe(angle);
    expect(bearing.x).toBeGreaterThanOrEqual(64);
    expect(bearing.x).toBeLessThanOrEqual(1136);
    expect(bearing.y).toBeGreaterThanOrEqual(48);
    expect(bearing.y).toBeLessThanOrEqual(752);
  }
  expect(agentBearing({ x: 1800, y: 400 }, viewport).group).toBe(agentBearing({ x: 2400, y: 401 }, viewport).group);
});

test("conversation remains readable and contained on desktop and narrow screens", () => {
  for (const view of [viewport, { width: 390, height: 700 }, { width: 240, height: 180 }]) {
    for (const point of [{ x: -200, y: -200 }, { x: 100, y: 100 }, { x: 2000, y: 2000 }]) {
      const panel = agentPanel(point, view);
      expect(panel.left).toBeGreaterThanOrEqual(12);
      expect(panel.top).toBeGreaterThanOrEqual(12);
      expect(panel.left + panel.width).toBeLessThanOrEqual(view.width - 12);
      expect(panel.top + panel.height).toBeLessThanOrEqual(view.height - 12);
    }
  }
  expect(agentPanel({ x: 300, y: 40 }, viewport).width).toBe(420);
});

test("expanding a card keeps its canvas anchor when there is room", () => {
  const point = { x: 300, y: 180 }, panel = agentPanel(point, viewport);
  expect(panel.left).toBe(point.x);
  expect(panel.top).toBe(point.y);
  expect(panel.height).toBe(560);
  expect(agentVisible({ x: 1100, y: 300 }, viewport)).toBe(false);
});

test("narrow task surfaces clear wrapped toolbars and the agent HUD", () => {
  const view = { width: 312, height: 591, topInset: 118, bottomInset: 64 };
  const panel = agentPanel({ x: 90, y: 140 }, view);
  expect(panel.top).toBeGreaterThanOrEqual(130);
  expect(panel.top + panel.height).toBeLessThanOrEqual(515);
  expect(panel.left + panel.width).toBeLessThanOrEqual(300);
  expect(agentVisible({ x: 30, y: 90 }, view)).toBe(false);
  const bearing = agentBearing({ x: 150, y: -300 }, view);
  expect(bearing.y).toBeGreaterThan(118);
});

test("off-screen detection uses the single-line pill at both zoom levels", () => {
  const view = { width: 1200, height: 800, bottomInset: 64 };
  expect(agentVisible({ x: 960, y: 688 }, view)).toBe(true);
  expect(agentVisible({ x: 960, y: 689 }, view)).toBe(false);
  expect(agentVisible({ x: 1028, y: 692 }, { ...view, scale: .4 })).toBe(true);
  expect(agentVisible({ x: 1029, y: 692 }, { ...view, scale: .4 })).toBe(false);
});

test("resizing a canvas conversation stops at the viewport without moving its top-left corner", () => {
  const start = { left: 300, top: 180, width: 420, height: 560 };
  const size = resizeAgentPanel(start, { x: 2000, y: 2000 }, viewport);
  expect(size).toEqual({ width: 888, height: 608 });
  expect(start.left + size.width).toBe(viewport.width - 12);
  expect(start.top + size.height).toBe(viewport.height - 12);
});

test("resizing the reading pane from its left edge keeps its right edge fixed", () => {
  const start = { left: 768, top: 12, width: 420, height: 560 };
  expect(resizeAgentPanel(start, { x: -160, y: 80 }, viewport, true)).toEqual({ width: 580, height: 640 });
  const size = resizeAgentPanel(start, { x: -2000, y: 2000 }, viewport, true);
  expect(size).toEqual({ width: 1176, height: 776 });
  expect(start.left + start.width - size.width).toBe(12);
});

test("resize dimensions are independent and remain large enough to use", () => {
  const start = { left: 100, top: 100, width: 420, height: 560 };
  expect(resizeAgentPanel(start, { x: -2000, y: 70 }, viewport)).toEqual({ width: 280, height: 630 });
  expect(resizeAgentPanel(start, { x: 80, y: -2000 }, viewport)).toEqual({ width: 500, height: 240 });
  expect(resizeAgentPanel(start, { x: 2000, y: -2000 }, viewport, true)).toEqual({ width: 280, height: 240 });
});

test("resize fits smaller spaces below the toolbar and above the HUD", () => {
  const view = { width: 240, height: 330, topInset: 118, bottomInset: 64 };
  const start = agentPanel({ x: 12, y: 130 }, view);
  expect(start).toEqual({ left: 12, top: 130, width: 216, height: 124 });
  expect(resizeAgentPanel(start, { x: 2000, y: 2000 }, view)).toEqual({ width: 216, height: 124 });
  expect(resizeAgentPanel(start, { x: -2000, y: -2000 }, view)).toEqual({ width: 216, height: 124 });
});

test("preferred conversation size returns when the viewport grows again", () => {
  const preferred = { width: 760, height: 640 }, point = { x: 40, y: 40 };
  const narrow = agentPanel(point, { width: 390, height: 700, topInset: 100, bottomInset: 64 }, preferred);
  expect(narrow).toEqual({ left: 12, top: 112, width: 366, height: 512 });
  expect(agentPanel(point, viewport, preferred)).toEqual({ left: 40, top: 40, width: 760, height: 640 });
  expect(preferred).toEqual({ width: 760, height: 640 });
});

test("canvas zoom does not change conversation resize distances", () => {
  const start = { left: 100, top: 100, width: 420, height: 560 }, delta = { x: 120, y: 40 };
  for (const scale of [.2, 1, 2]) {
    const view = { ...viewport, scale };
    expect(resizeAgentPanel(start, delta, view)).toEqual({ width: 540, height: 600 });
    expect(agentPanel({ x: 100, y: 100 }, view, { width: 540, height: 600 })).toEqual({ left: 100, top: 100, width: 540, height: 600 });
  }
});

test("a located pill stays visible when camera projection rounds slightly beyond the safe edge", () => {
  expect(agentVisible({ x: 11.99999999999996, y: 129.99999999999997 }, { width: 390, height: 700, topInset: 118 })).toBe(true);
});
