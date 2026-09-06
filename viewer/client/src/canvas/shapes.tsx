import { createContext, useContext } from "react";
import {
  BaseBoxShapeUtil,
  BindingUtil,
  Group2d,
  HTMLContainer,
  Polyline2d,
  Rectangle2d,
  ShapeUtil,
  Vec,
  useEditor,
  useValue,
  type BindingOnShapeChangeOptions,
  type TLShapePartial,
  type SvgExportContext,
} from "tldraw";
import ObjectName from "../ObjectName";
import type {
  GraphConnection,
  GraphSelection,
  GraphVertex,
} from "../graph/model";
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

export const CanvasModel = createContext({
  vertices: new Map<string, GraphVertex>(),
  connections: new Map<string, GraphConnection>(),
  select: (_selection: GraphSelection) => {},
  collapse: (_id: string) => {},
  matches: (_id: string): boolean => true,
});

function ObjectCard({ shape }: { shape: ObjectShape }) {
  const model = useContext(CanvasModel);
  const editor = useEditor();
  const selected = useValue(
    "Selected model reference",
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );
  const vertex = model.vertices.get(shape.props.graphId);
  const missing = !vertex;
  const primary = isPrimary(shape);
  return (
    <HTMLContainer
      className={`canvas-object ${shape.props.group ? "canvas-group" : "canvas-card"} ${!model.matches(shape.props.graphId) ? "canvas-dimmed" : ""}`}
      data-model-id={shape.props.graphId}
      data-missing={missing || undefined}
      data-selected={selected || undefined}
    >
      <div className="canvas-object-heading">
        <button
          className="canvas-object-title"
          aria-label={`${vertex?.kind || "Missing object"}: ${vertex?.title || shape.props.graphId}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => vertex?.selection && model.select(vertex.selection)}
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
        {vertex?.kind === "context" && vertex.selection?.kind === "item" && (
          <button
            className="canvas-collapse"
            aria-label={`${vertex.collapsed ? "Expand" : "Collapse"} context ${vertex.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() =>
              model.collapse(
                vertex.selection && "id" in vertex.selection
                  ? vertex.selection.id
                  : "",
              )
            }
          >
            {vertex.collapsed ? "+" : "−"} {vertex.count}
          </button>
        )}
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
    return { graphId: "", w: 190, h: 70, group: false };
  }
  override canResize(shape: ObjectShape) {
    return shape.props.group && !shape.meta.lexiconCollapsed;
  }
  override canResizeChildren() {
    return false;
  }
  override canEdit() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }
  override hideSelectionBoundsFg() {
    // The card paints its rounded border; context resize handles remain native.
    return true;
  }
  override canRemoveChildrenOfType() {
    return false;
  }
  override getGeometry(shape: ObjectShape) {
    const outline = new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: !shape.props.group,
    });
    return shape.props.group
      ? new Group2d({
          children: [
            outline,
            new Rectangle2d({
              width: shape.props.w,
              height: 44,
              isFilled: true,
            }),
          ],
        })
      : outline;
  }
  override getText(shape: ObjectShape) {
    return String(shape.meta.lexiconLabel || "Model reference");
  }
  override toSvg(shape: ObjectShape, ctx: SvgExportContext) {
    const ink = ctx.isDarkMode ? "#edeef4" : "#242b3d",
      paper = ctx.isDarkMode ? "#252b39" : "#fafbff";
    const label = this.getText(shape),
      max = Math.max(8, Math.floor((shape.props.w - 24) / 7));
    const words = label.split(" "),
      lines = [""];
    for (const word of words) {
      if (lines.at(-1)!.length + word.length > max) lines.push(word);
      else lines[lines.length - 1] += `${lines.at(-1) ? " " : ""}${word}`;
    }
    return (
      <g>
        <rect
          width={shape.props.w}
          height={shape.props.h}
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
          x={shape.props.group ? 14 : shape.props.w / 2}
          y={
            shape.props.group
              ? 27
              : Math.max(20, shape.props.h / 2 - (lines.length - 1) * 8)
          }
          textAnchor={shape.props.group ? "start" : "middle"}
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={shape.props.group ? 14 : shape.props.w / 2}
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
    path.roundRect(0, 0, shape.props.w, shape.props.h, 7);
    return path;
  }
}

function ConnectionCard({ shape }: { shape: ConnectionShape }) {
  const model = useContext(CanvasModel);
  const connection = model.connections.get(shape.props.graphId);
  const p = shape.props;
  const marker = `arrow-${encodeURIComponent(shape.id)}`;
  const end = p.points.at(-1) || { x: 0, y: 0 };
  const before = p.points.at(-2) || end;
  const angle =
    (Math.atan2(end.y - before.y, end.x - before.x) * 180) / Math.PI;
  // SVGContainer deliberately hides its subtree from accessibility. These labels are controls.
  return (
    <svg
      className={`tl-svg-container canvas-connection ${connection?.kind === "mapping" ? "canvas-mapping" : ""} ${!model.matches(p.graphId) ? "canvas-dimmed" : ""}`}
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
        x={p.labelX - p.labelWidth / 2}
        y={p.labelY - 15}
        width={p.labelWidth}
        height={30}
      >
        <button
          className="canvas-connection-label"
          data-connection-id={p.graphId}
          aria-label={`${connection?.summary ? "Read summary" : connection?.kind === "mapping" ? "Read code mapping" : "Read relationship"}: ${connection?.label || "Removed relationship"}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => connection && model.select(connection.selection)}
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
    return new Group2d({
      children: [
        new Polyline2d({
          points: p.points.map((point) => new Vec(point.x, point.y)),
        }),
        new Rectangle2d({
          x: p.labelX - p.labelWidth / 2,
          y: p.labelY - 15,
          width: p.labelWidth,
          height: 30,
          isFilled: true,
        }),
      ],
    });
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
    return new Path2D(shape.props.path);
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
