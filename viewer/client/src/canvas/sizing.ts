import type { Editor } from "tldraw";
import type { GraphVertex } from "../graph/model";
import type { ObjectShape } from "../../../shared/canvas-schema";
import type { FrameCache } from "./frameCache";
import { isPrimary } from "./references";
import { fitContextFrame } from "./territory";
import type { Bounds } from "../../../shared/canvas-geometry";
import { isAtlasLandmark, landmarkFootprint, landmarkFor, landmarks } from "./terrain/generate";

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
  const diagram = kind === "code" ? { w: Math.max(180, Math.min(360, title.length * 8 + 54)), h: 28 + (copy ? 16 : 0) }
    : { w: label.w + 45, h: label.h + 22 + (copy ? 16 : 0) };
  const building = isAtlasLandmark(kind) && !copy ? landmarkFor({ landmark, classification, elementKind: kind }) : "none";
  const mapLabel = labelSize(editor, title, 12), footprint = landmarkFootprint(building);
  const atlas = building === "none" ? diagram : {
    w: Math.max(mapLabel.w + 35, footprint.w + 12), h: footprint.h + mapLabel.h + 16,
  };
  // Reserve room for either presentation and every appearance choice. The visible
  // frame stays snug; switching mode never moves objects or rewrites the document.
  const reserve = !isAtlasLandmark(kind) || copy ? diagram : {
    w: Math.max(diagram.w, mapLabel.w + 35, ...landmarks.filter(k => k !== "auto").map(k => landmarkFootprint(k).w + 12)),
    h: Math.max(diagram.h, mapLabel.h + 74),
  };
  return { diagram, atlas, reserve };
}

export const isDirectory = (shape: ObjectShape) => shape.props.group && shape.props.graphId.startsWith("directory:");
export const isSourceFile = (shape: ObjectShape) => shape.props.group && shape.props.graphId.startsWith("file:");

/** File presentation follows its target rows, just as directories follow files. */
export function sourceFileFrame(editor: Editor, shape: ObjectShape, frames?: FrameCache): Bounds {
  const measure = () => {
    const children = editor.getSortedChildIdsForParent(shape.id).flatMap(id => {
      const child = editor.getShape(id);
      return child?.type === "lexicon-object" ? [{ x: child.x, y: child.y, w: child.props.w, h: child.props.h }] : [];
    });
    return fitContextFrame(children, objectSizes(editor, String(shape.meta.lexiconLabel || "File"), "file").diagram);
  };
  return frames ? frames.get(shape, "source-file", measure) : measure();
}

/** Directory presentation follows its files, including nested directory frames. */
export function directoryFrame(editor: Editor, shape: ObjectShape, frames?: FrameCache): Bounds {
  const measure = () => measureDirectoryFrame(editor, shape, frames);
  return frames ? frames.get(shape, "directory", measure) : measure();
}

function measureDirectoryFrame(editor: Editor, shape: ObjectShape, frames?: FrameCache): Bounds {
  const children = editor.getSortedChildIdsForParent(shape.id).flatMap(id => {
    const child = editor.getShape(id);
    if (child?.type !== "lexicon-object") return [];
    const frame = isDirectory(child) ? directoryFrame(editor, child, frames)
      : isSourceFile(child) ? sourceFileFrame(editor, child, frames)
      : { x: 0, y: 0, w: child.props.w, h: child.props.h };
    return [{ ...frame, x: child.x + frame.x, y: child.y + frame.y }];
  });
  return fitContextFrame(children, objectSizes(editor, String(shape.meta.lexiconLabel || "Directory"), "directory").diagram);
}

export function objectFrame(editor: Editor, shape: ObjectShape, vertex: GraphVertex | undefined, atlas: boolean, frames?: FrameCache): Bounds {
  if (isDirectory(shape)) return directoryFrame(editor, shape, frames);
  if (isSourceFile(shape)) return sourceFileFrame(editor, shape, frames);
  if (shape.props.group || !vertex || vertex.kind === "code") return { x: 0, y: 0, w: shape.props.w, h: shape.props.h };
  const sizes = objectSizes(editor, vertex.title, vertex.kind, shape.meta.lexiconLandmark, vertex.subtitle, !isPrimary(shape));
  const size = atlas ? sizes.atlas : sizes.diagram;
  return { x: (shape.props.w - size.w) / 2, y: (shape.props.h - size.h) / 2, ...size };
}

/** Match the connection button's italic 11px font, 7px side padding and 1px border. */
export function connectionLabelWidth(editor: Editor, title: string) {
  const key = `connection:${title}`;
  let cache = measurements.get(editor);
  if (!cache) measurements.set(editor, cache = new Map());
  let size = cache.get(key);
  if (!size) {
    const measured = editor.textMeasure.measureText(title, {
      fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: "normal", fontStyle: "italic",
      lineHeight: 1.4, maxWidth: null, padding: "0px",
    });
    size = { w: Math.min(320, Math.ceil(measured.w) + 16), h: measured.h };
    cache.set(key, size);
  }
  return size.w;
}
