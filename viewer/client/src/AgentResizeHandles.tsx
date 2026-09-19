import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { resizeAgentPanel, type AgentSize, type Point, type Viewport } from "./agentCanvas";

type Axis = "width" | "height" | "both";
type Geometry = { start: AgentSize & { left: number; top: number }; viewport: Viewport };

export default function AgentResizeHandles({ fromLeft, viewport, onStart, onResize }: {
  fromLeft: boolean; viewport?: Viewport; onStart: (point: Point) => void; onResize: (size: AgentSize) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Geometry & { x: number; y: number; axis: Axis }>();
  const [active, setActive] = useState<Axis>();
  const [values, setValues] = useState({ width: 0, height: 0, minWidth: 0, minHeight: 0, maxWidth: 0, maxHeight: 0 });
  const geometry = (): Geometry | undefined => {
    const pane = root.current?.parentElement;
    if (!pane) return;
    const box = pane.getBoundingClientRect();
    const origin = viewport ? pane.closest("[data-agent-surface]")?.getBoundingClientRect() : undefined;
    const statusHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-status-height")) || 0;
    return {
      start: { left: box.left - (origin?.left || 0), top: box.top - (origin?.top || 0), width: box.width, height: box.height },
      viewport: viewport || { width: window.innerWidth, height: window.innerHeight, bottomInset: statusHeight + 56 },
    };
  };
  const measure = () => {
    const current = geometry();
    if (!current) return;
    const min = resizeAgentPanel(current.start, { x: fromLeft ? 1e6 : -1e6, y: -1e6 }, current.viewport, fromLeft);
    const max = resizeAgentPanel(current.start, { x: fromLeft ? -1e6 : 1e6, y: 1e6 }, current.viewport, fromLeft);
    setValues({ width: current.start.width, height: current.start.height, minWidth: min.width, minHeight: min.height, maxWidth: max.width, maxHeight: max.height });
  };
  useLayoutEffect(() => {
    const pane = root.current?.parentElement;
    if (!pane) return;
    const observer = new ResizeObserver(measure);
    observer.observe(pane); measure();
    return () => observer.disconnect();
  }, [fromLeft, viewport?.width, viewport?.height, viewport?.topInset, viewport?.bottomInset]);
  const finish = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    event.stopPropagation();
    const current = gesture.current;
    gesture.current = undefined; setActive(undefined);
    if (cancel && current) onResize({ width: current.start.width, height: current.start.height });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={root} className={`agent-resize-handles${fromLeft ? " from-left" : ""}`} data-resizing={active}>
    {(["width", "height", "both"] as const).map(axis => <div key={axis}
      className={`agent-resize-handle resize-${axis}`} data-view-control
      role={axis === "both" ? undefined : "separator"} tabIndex={axis === "both" ? undefined : 0}
      aria-hidden={axis === "both" || undefined}
      aria-label={axis === "both" ? undefined : `Resize conversation ${axis}`}
      aria-orientation={axis === "both" ? undefined : axis === "width" ? "vertical" : "horizontal"}
      aria-valuenow={axis === "both" ? undefined : Math.round(values[axis])}
      aria-valuemin={axis === "both" ? undefined : Math.round(axis === "width" ? values.minWidth : values.minHeight)}
      aria-valuemax={axis === "both" ? undefined : Math.round(axis === "width" ? values.maxWidth : values.maxHeight)}
      title={axis === "both" ? "Drag to resize conversation" : `Drag or use arrow keys to resize ${axis}`}
      onFocus={measure}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.button !== 0) return;
        const current = geometry();
        if (!current) return;
        event.preventDefault();
        if (axis !== "both") event.currentTarget.focus();
        gesture.current = { ...current, x: event.clientX, y: event.clientY, axis };
        onStart({ x: current.start.left, y: current.start.top });
        setActive(axis); event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        event.stopPropagation();
        const current = gesture.current;
        if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        onResize(resizeAgentPanel(current.start, { x: axis === "height" ? 0 : event.clientX - current.x, y: axis === "width" ? 0 : event.clientY - current.y }, current.viewport, fromLeft));
      }}
      onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={() => { gesture.current = undefined; setActive(undefined); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (!(axis === "width" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]).includes(event.key)) return;
        const current = geometry();
        if (!current) return;
        event.preventDefault();
        const delta = (event.shiftKey ? 40 : 10) * (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1);
        onStart({ x: current.start.left, y: current.start.top });
        onResize(resizeAgentPanel(current.start, { x: axis === "width" ? delta : 0, y: axis === "height" ? delta : 0 }, current.viewport, fromLeft));
      }}
    />)}
  </div>;
}
