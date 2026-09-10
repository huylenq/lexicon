import { useEditor, useValue } from "tldraw";
import { useCanvasPresentation } from "./presentation";
import { cornerRadius, maxCornerRadius } from "./rounded-route";

export function ConnectionStylePanel() {
  const editor = useEditor(), model = useCanvasPresentation(editor);
  const selected = useValue("Relationship appearance selection", () => editor.getSelectedShapes(), [editor]);
  const shape = selected.length === 1 ? selected[0] : undefined;
  if (model.mapEnabled || shape?.type !== "lexicon-connection" || model.connections.get(shape.props.graphId)?.kind !== "relationship") return null;
  return <div className="map-style-panel tlui-style-panel tlui-style-panel__wrapper" aria-label="Relationship appearance"
    onPointerDownCapture={editor.markEventAsHandled} onPointerMoveCapture={editor.markEventAsHandled}
    onKeyDownCapture={event => {
      event.stopPropagation();
      if (event.key === "Escape") editor.getContainer().focus();
    }}>
    <label>Corner radius<input aria-label="Corner radius" type="number" min={0} max={maxCornerRadius} step={1}
      value={cornerRadius(shape.meta.lexiconCornerRadius)}
      onFocus={() => editor.markHistoryStoppingPoint("relationship corner radius")}
      onChange={event => {
        const value = event.target.valueAsNumber;
        if (Number.isFinite(value)) editor.updateShape({ id: shape.id, type: shape.type,
          meta: { ...shape.meta, lexiconCornerRadius: cornerRadius(value) } });
      }} /></label>
    <small>0–24 px · 0 keeps square corners</small>
  </div>;
}
