import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const KEY = "lexicon.assistant.window.v1";
const HANDLE = 44;
const GAP = 10;
const MARGIN = 12;
type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Geometry = { anchor: Point; size: Size; position?: Point };
export type Corner = "nw" | "ne" | "sw" | "se";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}
function bounds() {
  const css = getComputedStyle(document.documentElement);
  return {
    top: (parseFloat(css.getPropertyValue("--app-header-height")) || 48) + MARGIN,
    bottom: (parseFloat(css.getPropertyValue("--app-status-height")) || 28) + MARGIN,
  };
}
function panelBottom() {
  return bounds().bottom + (window.innerWidth <= 760 + 2 * (MARGIN + HANDLE + GAP) ? HANDLE + GAP : 0);
}
function fit(value: Geometry): Geometry {
  const vp = viewport();
  const safe = bounds();
  return {
    ...(value.position ? { position: value.position } : {}),
    anchor: { x: clamp(value.anchor.x, MARGIN, vp.width - HANDLE - MARGIN), y: clamp(value.anchor.y, safe.top, vp.height - safe.bottom - HANDLE) },
    size: { width: clamp(value.size.width, Math.min(320, vp.width - MARGIN * 2), Math.min(760, vp.width - MARGIN * 2)), height: clamp(value.size.height, Math.min(360, vp.height - safe.top - panelBottom()), Math.min(960, vp.height - safe.top - panelBottom())) },
  };
}
function initial(): Geometry {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as Geometry | null;
    if (saved && [saved.anchor?.x, saved.anchor?.y, saved.size?.width, saved.size?.height].every(Number.isFinite)) return fit(saved);
  } catch {}
  const vp = viewport();
  return fit({ anchor: { x: vp.width - HANDLE - 20, y: vp.height - HANDLE - bounds().bottom }, size: { width: 420, height: 600 } });
}
function position(g: Geometry) {
  const vp = viewport();
  const safe = bounds();
  if (g.position) return { x: clamp(g.position.x, MARGIN, vp.width - g.size.width - MARGIN), y: clamp(g.position.y, safe.top, vp.height - panelBottom() - g.size.height) };
  const left = g.anchor.x + HANDLE / 2 > vp.width / 2;
  return {
    x: clamp(left ? g.anchor.x - GAP - g.size.width : g.anchor.x + HANDLE + GAP, MARGIN, vp.width - g.size.width - MARGIN),
    y: clamp(g.anchor.y + HANDLE - g.size.height, safe.top, vp.height - panelBottom() - g.size.height),
  };
}

function launcherPosition(g: Geometry, panel: Point, open: boolean): Point {
  const vp = viewport();
  const safe = bounds();
  const anchor = {
    x: clamp(g.anchor.x, MARGIN, vp.width - HANDLE - MARGIN),
    y: clamp(g.anchor.y, safe.top, vp.height - safe.bottom - HANDLE),
  };
  if (!open) return anchor;
  const right = panel.x + g.size.width;
  const bottom = panel.y + g.size.height;
  if (vp.width <= 600) return { x: vp.width - HANDLE - MARGIN, y: bottom + GAP };
  const overlaps = anchor.x < right + GAP && anchor.x + HANDLE > panel.x - GAP
    && anchor.y < bottom + GAP && anchor.y + HANDLE > panel.y - GAP;
  if (!overlaps) return anchor;
  // Prefer either side; narrower viewports reserve a row below the panel.
  if (right + GAP + HANDLE <= vp.width - MARGIN) return { x: right + GAP, y: anchor.y };
  if (panel.x - GAP - HANDLE >= MARGIN) return { x: panel.x - GAP - HANDLE, y: anchor.y };
  return { x: anchor.x, y: bottom + GAP };
}

/** Window geometry is independent of project conversations. Pointer capture keeps
 * drags local and handles touch, pen, cancellation, and release outside the grip. */
export default function useAssistantWindow(toggle: () => void, open: boolean, toolbarHost: HTMLElement | null) {
  const [preferDocked, setPreferDocked] = useState(() => {
    try { return localStorage.getItem(KEY + ".docked") === "true"; } catch { return false; }
  });
  const docked = preferDocked && !!toolbarHost;
  const [dockTarget, setDockTarget] = useState(false);
  const [launcherOffset, setLauncherOffset] = useState<Point | null>(null);
  const setDocked = (value: boolean) => {
    setPreferDocked(value);
    try { localStorage.setItem(KEY + ".docked", String(value)); } catch {}
  };
  const overToolbar = (x: number, y: number) => {
    const rect = toolbarHost?.closest(".toolbar")?.getBoundingClientRect();
    return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };
  const [geometry, setGeometry] = useState(initial);
  const [gesture, setGesture] = useState<{
    pointer: number; start: Point; geometry: Geometry; pos: Point;
    kind: "launcher" | "window" | Corner; moved: boolean;
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<Point | null>(null);
  useEffect(() => {
    const resize = () => setGeometry(current => fit(current));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!gesture) try { localStorage.setItem(KEY, JSON.stringify(geometry)); } catch {}
  }, [geometry, gesture]);
  const pos = dragPosition || position(geometry);
  const start = (event: ReactPointerEvent<HTMLElement>, kind: NonNullable<typeof gesture>["kind"]) => {
    if (event.button !== 0 || (kind === "window" && (event.target as HTMLElement).closest("button, input, select"))) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const startGeometry = kind === "launcher" ? { ...geometry, anchor: { x: rect.x, y: rect.y } } : geometry;
    setGesture({ pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, geometry: startGeometry, pos, kind, moved: false });
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const dx = event.clientX - gesture.start.x;
    const dy = event.clientY - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
    setGesture({ ...gesture, moved: true });
    const g = gesture.geometry;
    if (gesture.kind === "launcher") {
      setDockTarget(overToolbar(event.clientX, event.clientY));
      setLauncherOffset({ x: dx, y: dy });
      setGeometry(fit({ size: g.size, anchor: { x: g.anchor.x + dx, y: g.anchor.y + dy } }));
      return;
    }
    const vp = viewport();
    const safe = bounds();
    let nextPos: Point;
    let size = g.size;
    if (gesture.kind === "window") {
      nextPos = { x: clamp(gesture.pos.x + dx, MARGIN, vp.width - size.width - MARGIN), y: clamp(gesture.pos.y + dy, safe.top, vp.height - panelBottom() - size.height) };
    } else {
      const west = gesture.kind.includes("w");
      const north = gesture.kind.includes("n");
      const right = gesture.pos.x + g.size.width;
      const bottom = gesture.pos.y + g.size.height;
      size = {
        width: clamp(g.size.width + (west ? -dx : dx), Math.min(320, vp.width - MARGIN * 2), Math.min(760, west ? right - MARGIN : vp.width - MARGIN - gesture.pos.x)),
        height: clamp(g.size.height + (north ? -dy : dy), Math.min(360, vp.height - safe.top - panelBottom()), Math.min(960, north ? bottom - safe.top : vp.height - panelBottom() - gesture.pos.y)),
      };
      nextPos = { x: west ? right - size.width : gesture.pos.x, y: north ? bottom - size.height : gesture.pos.y };
    }
    setDragPosition(nextPos);
    // Keep the launcher beside the window; release uses this same rectangle.
    const left = g.anchor.x + HANDLE / 2 > vp.width / 2;
    setGeometry({ size, position: nextPos, anchor: { x: left ? nextPos.x + size.width + GAP : nextPos.x - HANDLE - GAP, y: nextPos.y + size.height - HANDLE } });
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const cancelled = event.type === "pointercancel";
    if (cancelled) setGeometry(gesture.geometry);
    else if (gesture.kind === "launcher" && !gesture.moved) toggle();
    else if (gesture.kind === "launcher") {
      setDocked(overToolbar(event.clientX, event.clientY));
      setGeometry(current => {
        const vp = viewport();
        const safe = bounds();
        const anchor = { ...current.anchor };
        if (anchor.x < 72) anchor.x = MARGIN;
        else if (anchor.x > vp.width - HANDLE - 72) anchor.x = vp.width - HANDLE - MARGIN;
        if (anchor.y < safe.top + 60) anchor.y = safe.top;
        else if (anchor.y > vp.height - safe.bottom - HANDLE - 60) anchor.y = vp.height - safe.bottom - HANDLE;
        return fit({ ...current, anchor });
      });
    }
    setLauncherOffset(null);
    setDockTarget(false);
    setDragPosition(null);
    setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handlers = (kind: NonNullable<typeof gesture>["kind"]) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => start(event, kind),
    onPointerMove: move, onPointerUp: end, onPointerCancel: end,
  });
  const launcher = launcherPosition(geometry, pos, open);
  return {
    paneStyle: { left: pos.x, top: pos.y, right: "auto", bottom: "auto", width: geometry.size.width, height: geometry.size.height } as CSSProperties,
    launcherStyle: docked ? { transform: launcherOffset ? `translate(${launcherOffset.x}px, ${launcherOffset.y}px)` : undefined } : { left: launcher.x, top: launcher.y } as CSSProperties,
    docked, dockTarget, canDock: !!toolbarHost, toggleDock: () => setDocked(!docked),
    handlers,
    dragging: gesture?.kind === "launcher" && gesture.moved,
  };
}
export type AssistantWindow = ReturnType<typeof useAssistantWindow>;
