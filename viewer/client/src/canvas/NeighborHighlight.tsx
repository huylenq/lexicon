import { atom, useValue, type Atom, type Editor, type TLShapeId } from "tldraw";
import type { ObjectShape, ConnectionShape } from "../../../shared/canvas-schema";
import type { GraphConnection } from "../graph/model";
import { CanvasButton } from "./Toolbar";
import { useTooltip } from "../useTooltip";

const preferenceKey = "lexicon.highlightSelectedNeighbors";
function savedPreference() {
  try { return localStorage.getItem(preferenceKey) === "true"; } catch { return false; }
}
export const highlightSelectedNeighbors = atom("Highlight selected neighbors", savedPreference());
const heldAnchors = new WeakMap<Editor, Atom<TLShapeId | undefined>>();
function heldAnchor(editor: Editor) {
  let state = heldAnchors.get(editor);
  if (!state) { state = atom<TLShapeId | undefined>("Neighbor source", undefined); heldAnchors.set(editor, state); }
  return state;
}
export function holdNeighborAnchor(editor: Editor, id?: TLShapeId) { heldAnchor(editor).set(id); }
const labelHovers = new WeakMap<Editor, Atom<TLShapeId | undefined>>();
function labelHover(editor: Editor) {
  let state = labelHovers.get(editor);
  if (!state) { state = atom<TLShapeId | undefined>("Hovered neighbor label", undefined); labelHovers.set(editor, state); }
  return state;
}
// Native selection handles can suppress tldraw's hovered shape on a selected label.
export function hoverNeighborLabel(editor: Editor, id?: TLShapeId) { labelHover(editor).set(id); }
function highlightAnchors(editor: Editor, includeHeld = true): (ObjectShape | ConnectionShape)[] {
  const shapes = highlightSelectedNeighbors.get() ? editor.getSelectedShapes() : [];
  const hoveredId = labelHover(editor).get() ?? editor.getHoveredShapeId();
  const hovered = hoveredId && editor.getShape(hoveredId);
  const heldId = heldAnchor(editor).get(), held = heldId && editor.getShape(heldId);
  return [...new Map([...(hovered ? [hovered] : []), ...(includeHeld && held ? [held] : []), ...shapes]
    .filter((shape): shape is ObjectShape | ConnectionShape =>
      (shape.type === "lexicon-object" || shape.type === "lexicon-connection") && !editor.isShapeHidden(shape))
    .map(shape => [shape.id, shape])).values()];
}
export function neighborAnchors(editor: Editor, includeHeld = true): ObjectShape[] {
  return highlightAnchors(editor, includeHeld).filter((shape): shape is ObjectShape => shape.type === "lexicon-object");
}
export function neighborEdges(editor: Editor, includeHeld = true): ConnectionShape[] {
  return highlightAnchors(editor, includeHeld).filter((shape): shape is ConnectionShape => shape.type === "lexicon-connection");
}
export function isNeighborConnection(editor: Editor, connection?: GraphConnection) {
  return !!connection && neighborAnchors(editor).some(shape =>
    shape.props.graphId === connection.source || shape.props.graphId === connection.target);
}
if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key === preferenceKey || event.key === null) highlightSelectedNeighbors.set(savedPreference());
});

export function NeighborHighlight() {
  const enabled = useValue("Highlight selected neighbors", () => highlightSelectedNeighbors.get(), []);
  const tip = useTooltip<HTMLSpanElement>("Highlight neighbors on selection · Hover highlighting is always on");
  return <><span ref={tip.anchor} onPointerEnter={tip.onPointerEnter} onPointerLeave={tip.onPointerLeave}>
    <CanvasButton icon="relationship" label="Highlight neighbors on selection" title=""
      aria-pressed={enabled} aria-describedby={tip.describedBy} onFocus={tip.onFocus} onBlur={tip.onBlur}
      onClick={() => {
        highlightSelectedNeighbors.set(!enabled);
        try { localStorage.setItem(preferenceKey, String(!enabled)); } catch { /* Works without storage. */ }
      }} />
  </span>{tip.tooltip}</>;
}
