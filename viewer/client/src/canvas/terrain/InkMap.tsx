import { useMemo } from "react";
import { useEditor, useValue } from "tldraw";
import { setBorderEditing, useCanvasPresentation } from "../presentation";
import { isPrimary } from "../references";
import type { Bounds } from "../../../../shared/canvas-geometry";
import { choice, createMapGenerator, landmarks, paths, terrains, type MapNode, type MapRoad } from "./generate";
import { InkDrawing } from "./InkDrawing";
import { roadInput } from "./view";
import { contextLabelFrame, contextTerritory, isContext } from "../contexts";
import "./map.css";

export function InkMapBackground() {
  const editor = useEditor(), model = useCanvasPresentation(editor);
  const source = useValue("Map geometry", () => {
    const nodes: MapNode[] = [], roads: MapRoad[] = [], obstacles: Bounds[] = [];
    if (!model.mapEnabled) return { nodes, roads, obstacles };
    for (const shape of editor.getCurrentPageShapes()) {
      if (editor.isShapeHidden(shape)) continue;
      const box = editor.getShapePageBounds(shape);
      if (!box) continue;
      const bounds = { x: box.x, y: box.y, w: box.w, h: box.h };
      if (shape.type === "lexicon-object" && isPrimary(shape)) {
        const vertex = model.vertices.get(shape.props.graphId);
        if (vertex?.kind === "context" && isContext(shape)) {
          const transform = editor.getShapePageTransform(shape);
          const territory = contextTerritory(editor, shape), label = contextLabelFrame(editor, shape, true);
          nodes.push({ id: vertex.id, kind: "context", bounds,
            boundary: territory.points.map(p => transform.applyToPoint(p)),
            origin: transform.applyToPoint({ x: 0, y: 0 }),
            label: { ...transform.applyToPoint(label), w: label.w, h: label.h }, terrain: shape.meta.lexiconTerrain });
          continue;
        }
        if (vertex?.kind === "concept") {
          nodes.push({ id: vertex.id, kind: "concept", bounds, classification: vertex.subtitle, landmark: shape.meta.lexiconLandmark });
          continue;
        }
      }
      if (shape.type === "lexicon-connection") {
        const connection = model.connections.get(shape.props.graphId);
        const road = roadInput(editor, shape);
        if (connection?.kind === "relationship" && isPrimary(shape)) {
          const transform = editor.getShapePageTransform(shape);
          roads.push({ id: connection.id, points: (road?.points || shape.props.points).map(p => transform.applyToPoint(p)),
            entrances: road?.entrances, kind: choice(shape.meta.lexiconPath, paths, "road") });
        }
        // Relation labels retain a clear patch of ground.
        const p = shape.props, transform = editor.getShapePageTransform(shape);
        const position = transform.applyToPoint({ x: (road || p).labelX - p.labelWidth / 2, y: (road || p).labelY - 15 });
        obstacles.push({ ...position, w: p.labelWidth, h: 30 });
      } else obstacles.push(bounds);
    }
    return { nodes, roads, obstacles };
  }, [editor, model.mapEnabled, model.atlasSkin, model.vertices, model.connections]);
  const generate = useMemo(() => createMapGenerator(), [editor]);
  const scene = useMemo(() => generate(model.modelId, source.nodes, source.roads, source.obstacles), [generate, model.modelId, source]);
  const camera = useValue("Map camera", () => editor.getCamera(), [editor]);
  const detail = useValue("Map detail", () => editor.getZoomLevel() >= .4, [editor]);
  return <div className="tl-background">
    {model.mapEnabled && <svg className="canvas-map" aria-hidden="true" data-testid="procedural-map">
      <g transform={`scale(${camera.z}) translate(${camera.x},${camera.y})`} data-map-camera>
        <InkDrawing skin={model.atlasSkin ?? "ink"} scene={scene} detail={detail} matches={model.matches} />
      </g>
    </svg>}
  </div>;
}

/** Appearance choices use native shape metadata, shared persistence, and canvas undo. */
export function MapStylePanel() {
  const editor = useEditor(), model = useCanvasPresentation(editor);
  const selected = useValue("Map appearance selection", () => editor.getSelectedShapes(), [editor]);
  const shape = selected.length === 1 ? selected[0] : undefined;
  const editing = !!shape && model.editingTerritory === shape.id;
  if (!model.mapEnabled || !shape || !isPrimary(shape)) return null;
  const vertex = shape.type === "lexicon-object" ? model.vertices.get(shape.props.graphId) : undefined;
  const connection = shape.type === "lexicon-connection" ? model.connections.get(shape.props.graphId) : undefined;
  const category = vertex?.kind === "concept" ? "landmark" : vertex?.kind === "context" ? "terrain" : connection?.kind === "relationship" ? "path" : undefined;
  if (!category) return null;
  const options = category === "landmark" ? landmarks : category === "terrain" ? terrains : paths;
  const key = category === "landmark" ? "lexiconLandmark" : category === "terrain" ? "lexiconTerrain" : "lexiconPath";
  const value = typeof shape.meta[key] === "string" && options.includes(shape.meta[key] as never) ? String(shape.meta[key]) : options[0];
  const title = category[0].toUpperCase() + category.slice(1);
  return <div className="map-style-panel tlui-style-panel tlui-style-panel__wrapper" aria-label="Map appearance"
    onPointerDownCapture={editor.markEventAsHandled} onPointerMoveCapture={editor.markEventAsHandled}
    onKeyDownCapture={event => {
      // Native select navigation must not also nudge shapes or switch canvas tools.
      event.stopPropagation();
      if (event.key === "Escape") editor.getContainer().focus();
    }}>
    <label>{title}<select aria-label={title} value={value} onChange={event => {
      editor.markHistoryStoppingPoint("map appearance");
      editor.updateShape({ id: shape.id, type: shape.type, meta: { ...shape.meta, [key]: event.target.value } });
    }}>
      {options.map(option => <option key={option} value={option}>{option === "auto" ? "By classification" : option[0].toUpperCase() + option.slice(1)}</option>)}
    </select></label>
    {category === "terrain" && isContext(shape) && <>
      <button aria-pressed={editing} onClick={() => {
        setBorderEditing(editor, editing ? undefined : shape.id);
        editor.setCurrentTool("select").focus();
      }}>{editing ? "Finish border editing" : "Edit border"}</button>
      <button onClick={() => {
        editor.markHistoryStoppingPoint("reshape territory");
        editor.updateShape({ id: shape.id, type: shape.type, props: { territory: null } });
      }}>Reshape to contents</button>
      <small>Follows contents. Border edits guide the outline where space allows.</small>
    </>}
    <small>Shared canvas appearance</small>
  </div>;
}
