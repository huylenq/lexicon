import { useEffect, useRef } from "react";
import { useValue } from "tldraw";
import { edgeCornerRadius, maxCornerRadius, roundedRoute, setEdgeCornerRadius } from "./rounded-route";

function Curve({ radius }: { radius: number }) {
  const { path } = roundedRoute([{ x: 20, y: 70 }, { x: 72, y: 70 }, { x: 72, y: 26 }, { x: 180, y: 26 }], radius / maxCornerRadius * 22);
  return <svg viewBox="0 0 200 96" aria-hidden="true">
    <path className="edge-preview-guide" d="M 20 70 H 72 V 26 H 180" />
    <path className="edge-preview-line" d={path} />
    <circle cx="20" cy="70" r="4" /><circle cx="180" cy="26" r="4" />
  </svg>;
}

export function EdgeAppearance() {
  const radius = useValue("Edge rounding preference", () => edgeCornerRadius.get(), []);
  const menu = useRef<HTMLDetailsElement>(null);
  const drag = useRef<{ pointer: number; x: number; radius: number }>();
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <details className="edge-appearance" ref={menu} onKeyDown={event => {
    if (event.key === "Escape" && menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  }}>
    <summary className="quiet icon-button" aria-label="Edge appearance" title="Edge appearance">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M 3 16 H 7 Q 11 16 11 12 V 8 Q 11 4 15 4 H 18" />
        <circle cx="3" cy="16" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    </summary>
    <div className="edge-appearance-popover" role="group" aria-label="Edge appearance controls">
      <div className="edge-appearance-heading"><strong>Edge rounding</strong><span>All diagram edges</span></div>
      <div className="edge-preview" role="slider" tabIndex={0} aria-label="Corner radius"
        aria-valuemin={0} aria-valuemax={maxCornerRadius} aria-valuenow={radius} aria-valuetext={radius + " pixels"}
        aria-describedby="edge-drag-hint"
        onPointerDown={event => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointer: event.pointerId, x: event.clientX, radius };
        }}
        onPointerMove={event => {
          if (drag.current?.pointer !== event.pointerId) return;
          setEdgeCornerRadius(Math.round(drag.current.radius + event.clientX - drag.current.x));
        }}
        onPointerUp={event => {
          if (drag.current?.pointer !== event.pointerId) return;
          drag.current = undefined;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => { drag.current = undefined; }}
        onPointerCancel={() => { drag.current = undefined; }}
        onKeyDown={event => {
          const step = event.shiftKey ? 8 : 1;
          const next = event.key === "Home" ? 0 : event.key === "End" ? maxCornerRadius
            : ["ArrowRight", "ArrowUp"].includes(event.key) ? radius + step
            : ["ArrowLeft", "ArrowDown"].includes(event.key) ? radius - step : undefined;
          if (next === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          setEdgeCornerRadius(next);
        }}><Curve radius={radius} /></div>
      <div className="edge-radius-label"><span id="edge-drag-hint">Drag left or right</span><output>{radius}<span> px</span></output></div>
    </div>
  </details>;
}
