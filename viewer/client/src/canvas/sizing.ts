import type { Editor } from "tldraw";
import type { GraphVertex } from "../graph/model";
import type { ObjectShape } from "../../../shared/canvas-schema";
import { isPrimary } from "./references";
import type { Bounds } from "../../../shared/canvas-geometry";
import { landmarkFootprint, landmarkFor, landmarks } from "./terrain/generate";

const measurements = new WeakMap<Editor, Map<string, { w: number; h: number }>>();
function labelSize(editor: Editor, title: string, fontSize: number) {
  let cache = measurements.get(editor);
  if (!cache) measurements.set(editor, cache = new Map());
  const key = `${fontSize}:${title}`;
  let size = cache.get(key);
  if (!size) {
    const measured = editor.textMeasure.measureText(title, {
      fontFamily: "system-ui, sans-serif", fontSize, fontWeight: "500", fontStyle: "normal",
      lineHeight: 1.4, maxWidth: 220, padding: "0px",
    });
    size = { w: Math.ceil(measured.w), h: Math.ceil(measured.h) };
    cache.set(key, size);
  }
  return size;
}

export function objectSizes(editor: Editor, title: string, kind: string, landmark: unknown = "auto", classification?: string, copy = false) {
  const label = labelSize(editor, title, 14);
  const diagram = { w: label.w + 45, h: label.h + 22 + (kind === "code" || copy ? 16 : 0) };
  const building = kind === "concept" && !copy ? landmarkFor({ landmark, classification }) : "none";
  const mapLabel = labelSize(editor, title, 12), footprint = landmarkFootprint(building);
  const atlas = building === "none" ? diagram : {
    w: Math.max(mapLabel.w + 35, footprint.w + 12), h: footprint.h + mapLabel.h + 16,
  };
  // Reserve room for either presentation and every appearance choice. The visible
  // frame stays snug; switching mode never moves objects or rewrites the document.
  const reserve = kind !== "concept" || copy ? diagram : {
    w: Math.max(diagram.w, mapLabel.w + 35, ...landmarks.filter(k => k !== "auto").map(k => landmarkFootprint(k).w + 12)),
    h: Math.max(diagram.h, mapLabel.h + 74),
  };
  return { diagram, atlas, reserve };
}

export function objectFrame(editor: Editor, shape: ObjectShape, vertex: GraphVertex | undefined, atlas: boolean): Bounds {
  if (shape.props.group || !vertex) return { x: 0, y: 0, w: shape.props.w, h: shape.props.h };
  const sizes = objectSizes(editor, vertex.title, vertex.kind, shape.meta.lexiconLandmark, vertex.subtitle, !isPrimary(shape));
  const size = atlas ? sizes.atlas : sizes.diagram;
  return { x: (shape.props.w - size.w) / 2, y: (shape.props.h - size.h) / 2, ...size };
}
