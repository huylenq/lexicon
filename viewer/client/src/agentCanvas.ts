export type Point = { x: number; y: number };
export type Viewport = { width: number; height: number; scale?: number; topInset?: number; bottomInset?: number };
export type AgentSize = { width: number; height: number };

function fitAgentSize(size: AgentSize, width: number, height: number): AgentSize {
  const maxWidth = Math.max(1, width), maxHeight = Math.max(1, height);
  return {
    width: Math.max(Math.min(280, maxWidth), Math.min(size.width, maxWidth)),
    height: Math.max(Math.min(240, maxHeight), Math.min(size.height, maxHeight)),
  };
}

export function agentPillSize(scale = 1) {
  return scale < .5 ? { width: 160, height: 32 } : { width: 228, height: 36 };
}

export function agentStackOffset(index: number, scale: number): Point {
  return { x: 0, y: Math.max(0, index) * (agentPillSize(scale).height + 12) / scale };
}

export function agentVisible(point: Point, viewport: Viewport) {
  const pill = agentPillSize(viewport.scale);
  // Camera projection can land a fraction below an exact safe-edge coordinate.
  const epsilon = .5;
  return point.x >= 12 - epsilon && point.y >= (viewport.topInset || 0) + 12 - epsilon && point.x + pill.width <= viewport.width - 12 + epsilon && point.y + pill.height <= viewport.height - (viewport.bottomInset || 0) - 12 + epsilon;
}
/** Intersect the bearing from the viewport centre with its safe edge. */
export function agentBearing(point: Point, viewport: Viewport) {
  const top = viewport.topInset || 0, bottom = viewport.bottomInset || 0;
  const cx = viewport.width / 2, cy = (top + viewport.height - bottom) / 2;
  const dx = point.x - cx, dy = point.y - cy;
  const rx = Math.max(1, cx - 76), ry = Math.max(1, (viewport.height - top - bottom) / 2 - 48);
  const scale = Math.min(rx / (Math.abs(dx) || 1), ry / (Math.abs(dy) || 1));
  const x = cx + dx * scale, y = cy + dy * scale;
  const edge = Math.abs(dx) / rx > Math.abs(dy) / ry ? (dx < 0 ? "left" : "right") : (dy < 0 ? "top" : "bottom");
  return { x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI, group: `${edge}:${Math.floor((edge === "left" || edge === "right" ? y : x) / 100)}` };
}
/** Expanding a task grows the same card from its canvas anchor. */
export function agentPanel(point: Point, viewport: Viewport, size: AgentSize = { width: 420, height: 560 }) {
  const top = (viewport.topInset || 0) + 12, bottom = (viewport.bottomInset || 0) + 12;
  const { width, height } = fitAgentSize(size, viewport.width - 24, viewport.height - top - bottom);
  return { width, height, left: Math.max(12, Math.min(point.x, viewport.width - width - 12)), top: Math.max(top, Math.min(point.y, viewport.height - height - bottom)) };
}

/** Resize in screen pixels while keeping the opposite corner in place. */
export function resizeAgentPanel(start: AgentSize & { left: number; top: number }, delta: Point, viewport: Viewport, fromLeft = false): AgentSize {
  return fitAgentSize(
    { width: start.width + (fromLeft ? -delta.x : delta.x), height: start.height + delta.y },
    fromLeft ? start.left + start.width - 12 : viewport.width - start.left - 12,
    viewport.height - (viewport.bottomInset || 0) - start.top - 12,
  );
}
