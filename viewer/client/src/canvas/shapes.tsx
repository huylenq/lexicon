import {
  BaseBoxShapeUtil,
  BindingUtil,
  Group2d,
  HTMLContainer,
  Polygon2d,
  Polyline2d,
  Rectangle2d,
  ShapeUtil,
  Vec,
  getIndexAbove,
  ZERO_INDEX_KEY,
  useEditor,
  useValue,
  type BindingOnShapeChangeOptions,
  type TLShapePartial,
  type SvgExportContext,
  type TLHandle,
  type TLHandleDragInfo,
} from "tldraw";
import ObjectName from "../ObjectName";
import {
  objectProps,
  objectMigrations,
  connectionProps,
  noteBindingProps,
  type ObjectShape,
  type ConnectionShape,
  type NoteBinding,
} from "../../../shared/canvas-schema";
import { isPrimary } from "./references";
import { choice, landmarkFor, paths, pathFor } from "./terrain/generate";
import { roadCoveredAt, roadInput, shapeRoad, visibleObjectFrame } from "./terrain/view";
import { canvasPresentation, useCanvasPresentation } from "./presentation";
import { contextLabelFrame, contextPreferences, contextTerritory, isContext } from "./contexts";
import { moveBorderVertex, territoryEdit } from "./territory";

function ObjectCard({ shape }: { shape: ObjectShape }) {
  const editor = useEditor();
  const model = useCanvasPresentation(editor);
  const selected = useValue(
    "Selected model reference",
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );
  const vertex = model.vertices.get(shape.props.graphId);
  const missing = !vertex;
  const primary = isPrimary(shape);
  const frame = useValue("Visible model bounds", () => visibleObjectFrame(editor, shape), [editor, shape]);
  const boundary = useValue("Context boundary", () => isContext(shape) ? {
    label: contextLabelFrame(editor, shape, model.mapEnabled),
    points: model.mapEnabled ? contextTerritory(editor, shape).points : undefined,
  } : undefined, [editor, shape, model.mapEnabled]);
  return (
    <HTMLContainer
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
      className={`canvas-object ${shape.props.group ? "canvas-group" : "canvas-card"} ${!model.matches(shape.props.graphId) ? "canvas-dimmed" : ""}`}
      data-model-id={shape.props.graphId}
      data-context-boundary={boundary ? model.mapEnabled ? "territory" : "rectangle" : undefined}
      data-map-building={primary && vertex?.kind === "concept" && landmarkFor({ classification: vertex.subtitle, landmark: shape.meta.lexiconLandmark }) !== "none" ? "true" : undefined}
      data-missing={missing || undefined}
      data-selected={selected || undefined}
    >
      {boundary?.points && <svg className="canvas-territory-selection" aria-hidden="true">
        <path d={pathFor(boundary.points.map(p => ({ x: p.x - frame.x, y: p.y - frame.y })), true)} />
      </svg>}
      <div className="canvas-object-heading" style={boundary ? {
        position: "absolute", left: boundary.label.x - frame.x, top: boundary.label.y - frame.y,
        width: boundary.label.w, height: boundary.label.h, padding: "6px 8px",
      } : undefined}>
        <button
          className="canvas-object-title"
          aria-label={`${vertex?.kind || "Missing object"}: ${vertex?.title || shape.props.graphId}`}
          onClick={(event) => {
            // Pointer gestures belong to tldraw; retain keyboard activation.
            if (event.detail === 0)
              editor.setCurrentTool("select").select(shape.id).focus();
          }}
        >
          {vertex ? (
            <ObjectName
              type={
                vertex.kind === "file" || vertex.kind === "code"
                  ? "code"
                  : vertex.kind
              }
              classification={
                vertex.kind === "concept" ? vertex.subtitle : undefined
              }
              name={vertex.title}
            />
          ) : (
            "Object removed from model"
          )}
        </button>
      </div>
      {vertex?.kind === "code" && <small>{vertex.subtitle}</small>}
      {missing && (
        <small>
          {String(
            shape.meta.lexiconLabel || "The visual reference is retained.",
          )}
        </small>
      )}
      {!missing && !primary && <small>Reference copy</small>}
    </HTMLContainer>
  );
}

export class LexiconObjectUtil extends BaseBoxShapeUtil<ObjectShape> {
  static override type = "lexicon-object" as const;
  static override props = objectProps;
  static override migrations = objectMigrations;
  getDefaultProps() {
    return { graphId: "", w: 190, h: 70, group: false, territory: null };
  }
  override canResize(shape: ObjectShape) {
    return shape.props.group && !isContext(shape);
  }
  override hideResizeHandles(shape: ObjectShape) { return isContext(shape); }
  override hideSelectionBoundsBg(shape: ObjectShape) { return isContext(shape); }
  override canResizeChildren() {
    return false;
  }
  override isFrameLike(shape: ObjectShape) {
    return shape.props.group;
  }
  override canEdit() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }
  override hideSelectionBoundsFg() {
    // Cards and territories paint their own selection border.
    return true;
  }
  override canRemoveChildrenOfType() {
    return false;
  }
  override getGeometry(shape: ObjectShape) {
    const frame = visibleObjectFrame(this.editor, shape);
    const atlas = canvasPresentation(this.editor).get().mapEnabled;
    const outline = isContext(shape) && atlas ? new Polygon2d({
      points: contextTerritory(this.editor, shape).points.map(p => new Vec(p.x, p.y)), isFilled: false,
    }) : new Rectangle2d({
      x: frame.x, y: frame.y, width: frame.w, height: frame.h,
      isFilled: !shape.props.group,
    });
    return shape.props.group
      ? new Group2d({
          children: [
            outline,
            new Rectangle2d({
              ...(isContext(shape) ? (() => {
                const b = contextLabelFrame(this.editor, shape, atlas);
                return { x: b.x, y: b.y, width: b.w, height: b.h };
              })() : { width: shape.props.w, height: 44 }),
              isFilled: true,
              isLabel: true,
            }),
          ],
        })
      : outline;
  }
  override getHandles(shape: ObjectShape): TLHandle[] {
    const view = canvasPresentation(this.editor).get();
    if (!isContext(shape) || !view.mapEnabled || view.editingTerritory !== shape.id) return [];
    let index = ZERO_INDEX_KEY;
    return contextTerritory(this.editor, shape).points.map((p, i) => ({
      ...p, id: `border:${i}`, index: index = getIndexAbove(index), type: "vertex", canSnap: false,
    }));
  }
  override onHandleDrag(shape: ObjectShape, { handle, initial = shape }: TLHandleDragInfo<ObjectShape>): TLShapePartial<ObjectShape> | void {
    if (!isContext(shape) || !handle.id.startsWith("border:")) return;
    const before = contextTerritory(this.editor, initial);
    const after = moveBorderVertex(before, Number(handle.id.slice(7)), handle);
    const edits = contextPreferences(this.editor, initial)?.edits || [];
    // The handle index exists only for this native gesture. Persist geographic
    // differences with their own identity, never indices into a generated hull.
    const edit = territoryEdit(`border:${edits.length}`, before.points, after.points);
    return { id: shape.id, type: shape.type, props: {
      territory: edit ? { edits: [...edits, edit], legacy: null } : initial.props.territory,
    } };
  }
  override getText(shape: ObjectShape) {
    return String(shape.meta.lexiconLabel || "Model reference");
  }
  override toSvg(shape: ObjectShape, ctx: SvgExportContext) {
    const frame = visibleObjectFrame(this.editor, shape, false);
    const ink = ctx.isDarkMode ? "#edeef4" : "#242b3d",
      paper = ctx.isDarkMode ? "#252b39" : "#fafbff";
    const label = this.getText(shape),
      max = Math.max(8, Math.floor((frame.w - 24) / 7));
    const words = label.split(" "),
      lines = [""];
    for (const word of words) {
      if (lines.at(-1)!.length + word.length > max) lines.push(word);
      else lines[lines.length - 1] += `${lines.at(-1) ? " " : ""}${word}`;
    }
    return (
      <g transform={`translate(${frame.x},${frame.y})`}>
        <rect
          width={frame.w}
          height={frame.h}
          rx={7}
          fill={paper}
          fillOpacity={shape.props.group ? 0.5 : 1}
          stroke={ink}
          strokeOpacity={0.4}
        />
        <text
          fill={ink}
          fontFamily="sans-serif"
          fontSize={14}
          x={shape.props.group ? 14 : frame.w / 2}
          y={
            shape.props.group
              ? 27
              : Math.max(20, frame.h / 2 - (lines.length - 1) * 8)
          }
          textAnchor={shape.props.group ? "start" : "middle"}
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={shape.props.group ? 14 : frame.w / 2}
              dy={i ? 17 : 0}
            >
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }
  component(shape: ObjectShape) {
    return <ObjectCard shape={shape} />;
  }
  getIndicatorPath(shape: ObjectShape) {
    // Keep hover feedback without drawing a second outline over selected cards.
    if (this.editor.getSelectedShapeIds().includes(shape.id)) return;
    const path = new Path2D();
    if (isContext(shape) && canvasPresentation(this.editor).get().mapEnabled) {
      for (const [i, p] of contextTerritory(this.editor, shape).points.entries())
        if (i) path.lineTo(p.x, p.y); else path.moveTo(p.x, p.y);
      path.closePath();
      return path;
    }
    const frame = visibleObjectFrame(this.editor, shape);
    path.roundRect(frame.x, frame.y, frame.w, frame.h, 7);
    return path;
  }
}

function ConnectionCard({ shape }: { shape: ConnectionShape }) {
  const editor = useEditor();
  const model = useCanvasPresentation(editor);
  const connection = model.connections.get(shape.props.graphId);
  const p = shape.props;
  const road = useValue("Visible relationship route", () => roadInput(editor, shape), [editor, shape]);
  const label = road || p;
  const marker = `arrow-${encodeURIComponent(shape.id)}`;
  const end = p.points.at(-1) || { x: 0, y: 0 };
  const before = p.points.at(-2) || end;
  const angle =
    (Math.atan2(end.y - before.y, end.x - before.x) * 180) / Math.PI;
  // SVGContainer deliberately hides its subtree from accessibility. These labels are controls.
  return (
    <svg
      className={`tl-svg-container canvas-connection ${connection?.kind === "mapping" ? "canvas-mapping" : ""} ${!model.matches(p.graphId) ? "canvas-dimmed" : ""}`}
      data-atlas-road={model.mapEnabled && connection?.kind === "relationship" && isPrimary(shape) && choice(shape.meta.lexiconPath, paths, "road") !== "none" || undefined}
    >
      <path
        d={p.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeDasharray={connection?.kind === "mapping" ? "6 5" : undefined}
      />
      <path
        id={marker}
        d="M -9 -4 L 0 0 L -9 4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        transform={`translate(${end.x}, ${end.y}) rotate(${angle})`}
      />
      <foreignObject
        x={label.labelX - p.labelWidth / 2}
        y={label.labelY - 15}
        width={p.labelWidth}
        height={30}
      >
        <button
          className="canvas-connection-label"
          data-connection-id={p.graphId}
          aria-label={`${connection?.kind === "mapping" ? "Read code mapping" : "Read relationship"}: ${connection?.label || "Removed relationship"}`}
          onClick={(event) => {
            if (event.detail === 0)
              editor.setCurrentTool("select").select(shape.id).focus();
          }}
        >
          {connection?.label || "Removed relationship"}
        </button>
      </foreignObject>
    </svg>
  );
}

export class LexiconConnectionUtil extends ShapeUtil<ConnectionShape> {
  static override type = "lexicon-connection" as const;
  static override props = connectionProps;
  getDefaultProps() {
    return {
      graphId: "",
      path: "M 0 0 L 1 1",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      labelX: 0,
      labelY: 0,
      labelWidth: 80,
    };
  }
  override canResize() {
    return false;
  }
  override canBeLaidOut() {
    return false;
  }
  override hideSelectionBoundsBg() {
    return true;
  }
  override hideSelectionBoundsFg() {
    // The connection's indicator follows its route; a bounding box obscures the model.
    return true;
  }
  override hideResizeHandles() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }
  override onTranslate(
    initial: ConnectionShape,
  ): TLShapePartial<ConnectionShape> | void {
    if (isPrimary(initial))
      return { id: initial.id, type: initial.type, x: initial.x, y: initial.y };
  }
  getGeometry(shape: ConnectionShape) {
    const p = shape.props;
    const road = shapeRoad(this.editor, shape);
    const geometry = new Group2d({
      children: [
        road ? new Polygon2d({ points: road.outline.map(p => new Vec(p.x, p.y)), isFilled: true }) : new Polyline2d({
          points: p.points.map((point) => new Vec(point.x, point.y)),
        }),
        new Rectangle2d({
          x: (road || p).labelX - p.labelWidth / 2,
          y: (road || p).labelY - 15,
          width: p.labelWidth,
          height: 30,
          isFilled: true,
        }),
      ],
    });
    if (road) {
      geometry.ignoreHit = point => roadCoveredAt(this.editor, shape, point);
      const hitTestPoint = geometry.hitTestPoint.bind(geometry);
      geometry.hitTestPoint = (...args) => !geometry.ignoreHit(args[0]) && hitTestPoint(...args);
    }
    return geometry;
  }
  override getText(shape: ConnectionShape) {
    return String(shape.meta.lexiconLabel || "Model relationship");
  }
  override toSvg(shape: ConnectionShape, ctx: SvgExportContext) {
    const p = shape.props,
      end = p.points.at(-1)!,
      before = p.points.at(-2) || end;
    const angle =
      (Math.atan2(end.y - before.y, end.x - before.x) * 180) / Math.PI;
    const ink = ctx.isDarkMode ? "#566573" : "#7a8997",
      paper = ctx.isDarkMode ? "#252b39" : "#fafbff";
    return (
      <g>
        <path d={p.path} fill="none" stroke={ink} strokeWidth={1.8} />
        <path
          d="M -9 -4 L 0 0 L -9 4"
          fill="none"
          stroke={ink}
          strokeWidth={1.8}
          transform={`translate(${end.x}, ${end.y}) rotate(${angle})`}
        />
        <rect
          x={p.labelX - p.labelWidth / 2}
          y={p.labelY - 14}
          width={p.labelWidth}
          height={28}
          rx={5}
          fill={paper}
          stroke={ink}
        />
        <text
          x={p.labelX}
          y={p.labelY + 4}
          textAnchor="middle"
          fill={ctx.isDarkMode ? "#edeef4" : "#242b3d"}
          fontFamily="sans-serif"
          fontSize={11}
        >
          {this.getText(shape)}
        </text>
      </g>
    );
  }
  component(shape: ConnectionShape) {
    return <ConnectionCard shape={shape} />;
  }
  getIndicatorPath(shape: ConnectionShape) {
    const road = shapeRoad(this.editor, shape);
    return new Path2D(road ? pathFor(road.outline, true) : shape.props.path);
  }
}

/** Notes follow the attachment's page transform, including moves of its context. */
export class LexiconNoteBindingUtil extends BindingUtil<NoteBinding> {
  static override type = "lexicon-note" as const;
  static override props = noteBindingProps;
  getDefaultProps() {
    return { x: 0, y: 0 };
  }
  override onAfterChangeToShape({
    binding,
  }: BindingOnShapeChangeOptions<NoteBinding>) {
    const note = this.editor.getShape(binding.fromId);
    const target = this.editor.getShape(binding.toId);
    if (!note || !target) return;
    const page = this.editor
      .getShapePageTransform(target)
      .applyToPoint(binding.props);
    const position = this.editor.getPointInParentSpace(note, page);
    if (Math.abs(note.x - position.x) + Math.abs(note.y - position.y) > 0.01)
      this.editor.updateShape({
        id: note.id,
        type: note.type,
        x: position.x,
        y: position.y,
      });
  }
  override onAfterChangeFromShape({
    binding,
  }: BindingOnShapeChangeOptions<NoteBinding>) {
    const note = this.editor.getShape(binding.fromId);
    if (!note) return;
    const page = this.editor
      .getShapePageTransform(note)
      .applyToPoint({ x: 0, y: 0 });
    const position = this.editor.getPointInShapeSpace(binding.toId, page);
    if (
      Math.abs(position.x - binding.props.x) +
        Math.abs(position.y - binding.props.y) >
      0.01
    )
      this.editor.updateBinding({
        id: binding.id,
        type: binding.type,
        props: { x: position.x, y: position.y },
      });
  }
}
