import type { Editor } from "tldraw";
import type { AgentPoint, AgentBounds } from "../AgentWork";
import { canvasPlanes, type CanvasPlane } from "../graph/planes";
import { combinedOffset, combinedPage, flatPageIds } from "./combined";
import { primaryShapesOnPage } from "./references";

/** Project agents belong beside one authored plane, even when Combined moves that plane. */
export function canvasAgentAnchors(editor: Editor, preferred: CanvasPlane = "domain") {
  const page = editor.getCurrentPageId();
  const combined = page === combinedPage;
  const plane = canvasPlanes.find(dimension => page === flatPageIds[dimension]) || preferred;
  const anchors: Record<string, AgentPoint> = {};
  const itemBounds: Record<string, AgentBounds> = {}, historicalBounds: Record<string, AgentBounds> = {};
  const sourceBounds: Record<string, AgentBounds> = {};
  const dimensions: Record<string, CanvasPlane> = {};
  const origins: Partial<Record<CanvasPlane, AgentPoint>> = {};
  for (const [id, shape] of primaryShapesOnPage(editor)) {
    if (!shape.meta.lexiconMissing && editor.isShapeHidden(shape)) continue;
    const bounds = editor.getShapePageBounds(shape);
    if (!bounds) continue;
    const dimension = combined ? canvasPlanes.find(value => shape.meta.combinedDimension === value) : plane;
    const itemId = id.startsWith("item:") ? id.slice(5) : id.startsWith("relation:") ? id.slice(9) : undefined;
    if (itemId) {
      const point = editor.pageToViewport({ x: bounds.x, y: bounds.y }), end = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });
      const frame = { ...point, width: end.x - point.x, height: end.y - point.y };
      if (shape.meta.lexiconMissing) { historicalBounds[itemId] = frame; continue; }
      itemBounds[itemId] = frame;
      anchors[itemId] = editor.pageToViewport({ x: bounds.maxX + 20, y: bounds.y });
      if (dimension) dimensions[itemId] = dimension;
    }
    if (id.startsWith("file:") && !shape.meta.lexiconMissing) {
      const point = editor.pageToViewport({ x: bounds.x, y: bounds.y }), end = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });
      sourceBounds[id.slice(5).replace(/^\.\//, "")] = { ...point, width: end.x - point.x, height: end.y - point.y };
    }
    if (shape.type !== "lexicon-object") continue;
    // Expanded source links and long relationship routes must not move a model plane's home.
    if (!dimension || dimension !== "source" && !id.startsWith("item:")) continue;
    const before = origins[dimension];
    origins[dimension] = before ? { x: Math.min(before.x, bounds.x), y: Math.min(before.y, bounds.y) } : { x: bounds.x, y: bounds.y };
  }
  const homes: Partial<Record<CanvasPlane, AgentPoint>> = {};
  for (const dimension of combined ? canvasPlanes : [plane]) {
    const origin = origins[dimension];
    if (!origin && combined) continue;
    homes[dimension] = editor.pageToViewport({ x: (origin?.x || 0) - 280, y: origin?.y || 0 });
  }
  const homeDimension = homes[plane] ? plane : canvasPlanes.find(dimension => homes[dimension]) || plane;
  const fallback = combined ? combinedOffset(editor, homeDimension) : { x: 0, y: 0 };
  const home = homes[homeDimension] || editor.pageToViewport({ x: fallback.x - 280, y: fallback.y });
  const placementOrigins: Partial<Record<CanvasPlane, AgentPoint>> = {};
  for (const dimension of combined ? canvasPlanes : [plane]) placementOrigins[dimension] = editor.pageToViewport(combined ? combinedOffset(editor, dimension) : { x: 0, y: 0 });
  const selectedIds = (editor.getSelectedShapes?.() || []).flatMap(shape => {
    const id = "graphId" in shape.props ? shape.props.graphId : undefined;
    return typeof id === "string" && /^(item|relation):/.test(id) ? [id.slice(id.indexOf(":") + 1)] : [];
  });
  return { anchors, bounds: itemBounds, sourceBounds, historicalBounds, dimensions, selectedIds, origins: placementOrigins, homes, homeDimension, home };
}
