import { useRef, type PointerEvent } from "react";
import { Box, useEditor, useValue } from "tldraw";
import { combinedPage, combinedOffset, moveCombinedDimension, type DimensionOffset } from "./combined";

import { InkMapBackground } from "./terrain/InkMap";
import "./combined-background.css";

/** Dimension regions are viewing aids, not semantic containers or saved shapes. */
function useRegions() {
  const editor = useEditor();
  return useValue("Combined dimension regions", () => {
    if (editor.getCurrentPageId() !== combinedPage) return [];
    return (["domain", "architecture"] as const).flatMap(dimension => {
      const boxes = editor.getCurrentPageShapes().flatMap(shape => {
        if (shape.type === "lexicon-connection" || editor.isShapeHidden(shape)) return [];
        const bounds = shape.meta.combinedDimension === dimension && editor.getShapePageBounds(shape);
        return bounds ? [bounds] : [];
      });
      if (!boxes.length) return [];
      const bounds = Box.Common(boxes);
      const start = editor.pageToViewport(bounds.point);
      const end = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });
      return [{ dimension, x: start.x - 20, y: start.y - 48, width: end.x - start.x + 40, height: end.y - start.y + 68 }];
    });
  }, [editor]);
}

export function CombinedBackground() {
  const regions = useRegions();
  return <>
    <InkMapBackground />
    <div className="combined-regions" aria-label="Combined dimensions">
      {regions.map(region => <section key={region.dimension} className="combined-region" data-dimension={region.dimension}
        aria-label={region.dimension === "domain" ? "Domain region" : "Architecture region"}
        style={{ left: region.x, top: region.y, width: region.width, height: region.height }} />)}
    </div>
  </>;
}

/** Handles sit above the canvas so tldraw cannot consume their drag gestures. */
export function CombinedHandles() {
  const editor = useEditor();
  const regions = useRegions();
  const drag = useRef<{ pointer: number; x: number; y: number; offset: DimensionOffset; mark?: string }>();
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    event.stopPropagation();
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = undefined;
    if (current.mark) {
      if (cancel) editor.bailToMark(current.mark);
      else editor.markHistoryStoppingPoint();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="combined-handles">
    {regions.map(region => <h2 key={region.dimension} data-dimension={region.dimension}
      style={{ left: region.x + 18, top: region.y + 12 }}>
      <button type="button" aria-label={`Drag ${region.dimension === "domain" ? "Domain" : "Architecture"}`}
        title="Drag to move the whole dimension. Arrow keys move it; Shift moves farther."
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.stopPropagation();
          event.preventDefault();
          event.currentTarget.focus();
          const point = editor.screenToPage({ x: event.clientX, y: event.clientY });
          drag.current = { pointer: event.pointerId, x: point.x, y: point.y, offset: combinedOffset(editor, region.dimension) };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const current = drag.current;
          if (!current || current.pointer !== event.pointerId) return;
          event.stopPropagation();
          const point = editor.screenToPage({ x: event.clientX, y: event.clientY });
          const dx = point.x - current.x, dy = point.y - current.y;
          if (!current.mark && Math.hypot(dx, dy) * editor.getZoomLevel() < 3) return;
          current.mark ??= editor.markHistoryStoppingPoint("Move dimension");
          moveCombinedDimension(editor, region.dimension, { x: current.offset.x + dx, y: current.offset.y + dy });
        }}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={event => finish(event, true)}
        onKeyDown={event => {
          const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
          if (!delta) return;
          event.preventDefault(); event.stopPropagation();
          const step = event.shiftKey ? 100 : 10;
          editor.markHistoryStoppingPoint("Move dimension");
          const offset = combinedOffset(editor, region.dimension);
          moveCombinedDimension(editor, region.dimension, { x: offset.x + delta[0] * step, y: offset.y + delta[1] * step });
          editor.markHistoryStoppingPoint();
        }}>
        {region.dimension === "domain" ? "Domain" : "Architecture"}<span aria-hidden="true"> ⠿</span>
      </button>
    </h2>)}
  </div>;
}
