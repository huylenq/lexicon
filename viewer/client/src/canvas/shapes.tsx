import { SourceFileLabel, SourceTargetLabel } from "../source/SourceLabel";
import { finishObjectShoving } from "./shoveObjects";
import { useContext, useId } from "react";
import { FlowHighlight, SequenceHover } from "./FlowHighlight";
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
  getPointerInfo,
  ZERO_INDEX_KEY,
  useEditor,
  useValue,
  type BindingOnShapeChangeOptions,
  type TLShapePartial,
  type SvgExportContext,
  type TLHandle,
  type TLHandleDragInfo,
} from "tldraw";
import { useRouteMorph } from "./useRouteMorph";
import { connectionDrawing, connectionExportDrawing, isAtlasRoad } from "./rounded-route";
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
import { isAtlasLandmark, landmarkFor, pathFor } from "./terrain/generate";
import { roadCoveredAt, roadInput, shapeRoad, visibleObjectFrame } from "./terrain/view";
import { canvasPresentation, useCanvasPresentation, isCrossDimensionConnection } from "./presentation";
import { contextControlTerritory, contextNameCurve, contextLabelFrame, contextPreferences, contextTerritory, isContext } from "./contexts";
import { moveBorderVertex, territoryEdit } from "./territory";
import { neighborAnchors, neighborEdges, isNeighborConnection, hoverNeighborLabel, hoveredCanvasShapeId } from "./NeighborHighlight";

/** Punch the stroke behind the letters. Hug the 11px italic, not the 30px hit box. */
function labelStrokeGap(x: number, y: number, width: number) {
  const w = Math.max(8, width - 12);
  return { x: x - w / 2, y: y - 8, width: w, height: 16 };
}

function ObjectCard({ shape }: { shape: ObjectShape }) {
  const namePathId = `land-name-${useId().replace(/:/g, "")}`;
  const editor = useEditor();
  const model = useCanvasPresentation(editor);
  const selected = useValue(
    "Selected model reference",
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );
  const neighbor = useValue("Neighbor of hovered or selected model reference", () => {
    const references = new Set(neighborAnchors(editor).map(shape => shape.props.graphId));
    const id = shape.props.graphId;
    if (neighborEdges(editor).some(edge => {
      const connection = model.connections.get(edge.props.graphId);
      return connection?.source === id || connection?.target === id;
    })) return true;
    return [...model.connections.values()].some(connection =>
      connection.source !== connection.target && (
        (connection.source === id && references.has(connection.target)) ||
        (connection.target === id && references.has(connection.source))));
  }, [editor, shape.props.graphId, model.connections]);
  const sequenceHover = useContext(SequenceHover);
  const vertex = model.vertices.get(shape.props.graphId);
  const sequenceHovered = vertex?.selection?.kind === "item" && vertex.selection.id === sequenceHover;
  const flow = useContext(FlowHighlight).has(vertex?.selection?.kind === "item" ? vertex.selection.id : "");
  const missing = !vertex;
  const primary = isPrimary(shape);
  const frame = useValue("Visible model bounds", () => visibleObjectFrame(editor, shape), [editor, shape]);
  const boundary = useValue("Context boundary", () => isContext(shape) ? {
    label: contextLabelFrame(editor, shape, model.mapEnabled),
    curve: model.mapEnabled ? contextNameCurve(editor, shape) : undefined,
    points: model.mapEnabled ? contextTerritory(editor, shape).points : undefined,
    control: model.mapEnabled && model.editingTerritory === shape.id ? contextControlTerritory(editor, shape).points : undefined,
  } : undefined, [editor, shape, model.mapEnabled, model.editingTerritory]);
  return (
    <HTMLContainer
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
      className={`canvas-object ${shape.props.group ? "canvas-group" : "canvas-card"} ${!model.matches(shape.props.graphId) ? "canvas-dimmed" : ""}`}
      data-model-id={shape.props.graphId}
      data-hovered={sequenceHovered || undefined}
      data-source-kind={vertex?.kind === "file" || vertex?.kind === "code" || vertex?.kind === "directory" ? vertex.kind : undefined}
      data-atlas-label={model.mapEnabled && vertex ? vertex.kind : undefined}
      data-context-boundary={boundary ? model.mapEnabled ? "territory" : "rectangle" : undefined}
      data-map-building={primary && vertex && isAtlasLandmark(vertex.kind) && landmarkFor({ classification: vertex.subtitle, landmark: shape.meta.lexiconLandmark, elementKind: vertex.kind }) !== "none" ? "true" : undefined}
      data-missing={missing || undefined}
      data-selected={selected || undefined}
      data-neighbor={neighbor || flow || undefined}
      data-flow-highlight={flow || undefined}
    >
      {boundary?.points && <svg className="canvas-territory-selection" aria-hidden="true">
        <path d={pathFor(boundary.points.map(p => ({ x: p.x - frame.x, y: p.y - frame.y })), true)} />
        {boundary.control && <path className="canvas-territory-cage"
          d={pathFor(boundary.control.map(p => ({ x: p.x - frame.x, y: p.y - frame.y })), true)} />}
      </svg>}
      <div className="canvas-object-heading" style={boundary ? {
        position: "absolute", left: boundary.label.x - frame.x, top: boundary.label.y - frame.y,
        width: boundary.label.w, height: boundary.label.h, padding: boundary.curve ? 0 : "6px 8px",
      } : undefined}>
        <button
          className={`canvas-object-title ${boundary?.curve ? "atlas-context-name" : ""}`}
          onPointerEnter={() => hoverNeighborLabel(editor, shape.id)}
          onPointerLeave={() => hoverNeighborLabel(editor)}
          aria-label={`${vertex?.kind || "Missing object"}: ${vertex?.title || shape.props.graphId}`}
          onPointerDown={event => {
            if (event.button !== 0 && event.button !== 1) return;
            // Overlapping directory frames must not steal a visible object's title gesture.
            editor.dispatch({ ...getPointerInfo(editor, event), type: "pointer", name: "pointer_down", target: "shape", shape });
          }}
          onClick={(event) => {
            // Pointer gestures belong to tldraw; retain keyboard activation.
            if (event.detail === 0)
              editor.setCurrentTool("select").select(shape.id).focus();
          }}
        >
          {boundary?.curve && vertex ? (
            <svg viewBox={`${boundary.label.x} ${boundary.label.y} ${boundary.label.w} ${boundary.label.h}`}
              width={boundary.label.w} height={boundary.label.h} aria-hidden="true">
              <defs><path id={namePathId} d={boundary.curve.path} /></defs>
              <path className="atlas-name-hit" d={boundary.curve.path} transform="translate(0,-8)" />
              <text className="atlas-region-text" textAnchor="middle">
                <textPath href={`#${namePathId}`} startOffset="50%">{vertex.title}</textPath>
              </text>
            </svg>
          ) : model.mapEnabled && vertex && isAtlasLandmark(vertex.kind) ? (
            <span className="atlas-concept-name object-name-text">{vertex.title}</span>
          ) : vertex?.kind === "file" ? <SourceFileLabel file={vertex.subtitle} />
          : vertex?.kind === "directory" ? <span className="source-directory-label" title={vertex.subtitle}>{vertex.title}/</span>
          : vertex?.sourceLink ? <SourceTargetLabel link={vertex.sourceLink} />
          : vertex ? (
            <ObjectName
              type={
                vertex.kind === "code"
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
  override onTranslateEnd() {
    finishObjectShoving(this.editor);
  }
  getDefaultProps() {
    return { graphId: "", w: 190, h: 70, group: false, territory: null };
  }
  override canResize() { return false; }
  override hideResizeHandles() { return true; }
  override hideSelectionBoundsBg(shape: ObjectShape) { return isContext(shape); }
  override canResizeChildren() {
    return false;
  }
  override isFrameLike(shape: ObjectShape) {
    return shape.props.group;
  }
  override hideInMinimap(shape: ObjectShape) {
    // The minimap fills bounds; enclosing groups would cover their cards.
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
    const landName = isContext(shape) && atlas ? new Polygon2d({
      points: contextNameCurve(this.editor, shape).hit.map(p => new Vec(p.x, p.y)),
      isFilled: true, isLabel: true,
    }) : undefined;
    // Frame label picking normally uses a rectangle; follow the curved ribbon instead.
    if (landName) landName.isPointInBounds = (point, margin = 0) => landName.hitTestPoint(point, margin);
    return shape.props.group
      ? new Group2d({
          children: [
            outline,
            landName ?? new Rectangle2d({
              ...(isContext(shape) ? (() => {
                const b = contextLabelFrame(this.editor, shape, atlas);
                return { x: b.x, y: b.y, width: b.w, height: b.h };
              })() : { x: frame.x, y: frame.y, width: frame.w, height: 44 }),
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
    return contextControlTerritory(this.editor, shape).points.map((p, i) => ({
      ...p, id: `border:${i}`, index: index = getIndexAbove(index), type: "vertex", canSnap: false,
    }));
  }
  override onHandleDrag(shape: ObjectShape, { handle, initial = shape }: TLHandleDragInfo<ObjectShape>): TLShapePartial<ObjectShape> | void {
    if (!isContext(shape) || !handle.id.startsWith("border:")) return;
    const before = contextControlTerritory(this.editor, initial);
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
  const hovered = useValue("Hovered relationship", () => hoveredCanvasShapeId(editor) === shape.id, [editor, shape.id]);
  const selected = useValue("Selected relationship", () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id]);
  const model = useCanvasPresentation(editor);
  const connection = model.connections.get(shape.props.graphId);
  const flowIds = useContext(FlowHighlight);
  const sequenceHover = useContext(SequenceHover);
  const sequenceHovered = !!sequenceHover && connection?.relationships.includes(sequenceHover);
  const flow = connection?.relationships.some(id => flowIds.has(id));
  const neighbor = useValue("Highlighted neighbor connection", () => isNeighborConnection(editor, connection), [editor, connection]);
  const p = shape.props;
  const road = useValue("Visible relationship route", () => roadInput(editor, shape), [editor, shape]);
  const drawing = useValue("Rounded relationship drawing", () => connectionDrawing(shape, editor), [editor, shape]);
  const label = road || (drawing.label ? { labelX: drawing.label.x, labelY: drawing.label.y } : p);
  const dragging = useValue("Dragging relationship endpoints", () => editor.inputs.getIsDragging(), [editor]);
  const morph = useRouteMorph(road?.points || drawing.points, { x: label.labelX, y: label.labelY }, { x: shape.x, y: shape.y }, dragging, isPrimary(shape) && !!road);
  const marker = `arrow-${encodeURIComponent(shape.id)}`;
  const gap = `label-gap-${useId().replace(/:/g, "")}`;
  const gapBox = labelStrokeGap(morph.label.x, morph.label.y, p.labelWidth);
  const end = morph.points.at(-1) || { x: 0, y: 0 };
  const before = morph.points.at(-2) || end;
  const angle =
    (Math.atan2(end.y - before.y, end.x - before.x) * 180) / Math.PI;
  // SVGContainer deliberately hides its subtree from accessibility. These labels are controls.
  return (
    <svg
      className={`tl-svg-container canvas-connection ${connection?.kind === "mapping" ? "canvas-mapping" : ""} ${!model.matches(p.graphId) ? "canvas-dimmed" : ""}`}
      data-hovered={(sequenceHover === undefined && hovered) || sequenceHovered || undefined}
      data-selected={selected || undefined}
      data-neighbor={neighbor || flow || undefined}
      data-flow-highlight={flow || undefined}
      data-atlas-road={isAtlasRoad(shape, model) || undefined}
    >
      <defs>
        <mask id={gap} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
          <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
          <rect x={gapBox.x} y={gapBox.y} width={gapBox.width} height={gapBox.height} fill="black" />
        </mask>
      </defs>
      <g data-route-current="true" data-route-morphing={morph.animating || drawing.animating || undefined}>
      <path
        d={morph.animating ? pathFor(morph.points) : drawing.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeDasharray={connection?.kind === "mapping" || isCrossDimensionConnection(model, connection) ? "6 5" : undefined}
        mask={`url(#${gap})`}
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
        x={morph.label.x - p.labelWidth / 2}
        y={morph.label.y - 15}
        width={p.labelWidth}
        height={30}
      >
        <button
          className="canvas-connection-label"
          onPointerEnter={() => hoverNeighborLabel(editor, shape.id)}
          onPointerLeave={() => hoverNeighborLabel(editor)}
          data-connection-id={p.graphId}
          onPointerDown={event => {
            if (event.button !== 0 && event.button !== 1) return;
            // A visible label names its shape even when another route crosses it.
            // Dispatch the native shape gesture so dragging and modifier taps still work.
            editor.dispatch({ ...getPointerInfo(editor, event), type: "pointer", name: "pointer_down", target: "shape", shape });
          }}
          aria-label={`${connection?.kind === "mapping" ? "Read source link" : "Read relationship"}: ${connection?.label || "Removed relationship"}`}
          onClick={(event) => {
            if (event.detail === 0)
              editor.setCurrentTool("select").select(shape.id).focus();
          }}
        >
          {connection?.label || "Removed relationship"}
        </button>
      </foreignObject>
      </g>
    </svg>
  );
}

export class LexiconConnectionUtil extends ShapeUtil<ConnectionShape> {
  static override type = "lexicon-connection" as const;
  static override props = connectionProps;
  override canCull(shape: ConnectionShape) {
    // Route animation changes geometry without changing the shape record, so
    // tldraw's spatial index can still contain an earlier animation frame.
    // Confirm against live bounds before hiding an allegedly off-screen edge.
    const bounds = this.editor.getShapePageBounds(shape);
    return !!bounds && !bounds.collides(this.editor.getViewportPageBounds());
  }
  override hideInMinimap() {
    // A routed connection's bounding rectangle can cover most of the diagram.
    return true;
  }
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
    const drawing = road ? undefined : connectionDrawing(shape, this.editor);
    const routeGeometry = road
      ? [new Polygon2d({ points: road.outline.map(p => new Vec(p.x, p.y)), isFilled: true })]
      : (drawing!.hitPaths || [drawing!.points]).map(points => new Polyline2d({ points: points.map(point => new Vec(point.x, point.y)) }));
    const geometry = new Group2d({
      children: [
        ...routeGeometry,
        new Rectangle2d({
          x: (road?.labelX ?? drawing?.label?.x ?? p.labelX) - p.labelWidth / 2,
          y: (road?.labelY ?? drawing?.label?.y ?? p.labelY) - 15,
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
  override async toSvg(shape: ConnectionShape, ctx: SvgExportContext) {
    const drawing = await connectionExportDrawing(shape, this.editor, ctx);
    const p = shape.props,
      end = p.points.at(-1)!,
      before = p.points.at(-2) || end;
    const angle =
      (Math.atan2(end.y - before.y, end.x - before.x) * 180) / Math.PI;
    const ink = ctx.isDarkMode ? "#566573" : "#7a8997",
      paper = ctx.isDarkMode ? "#252b39" : "#fafbff";
    const gap = `export-label-gap-${shape.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const gapBox = labelStrokeGap(drawing.label?.x ?? p.labelX, drawing.label?.y ?? p.labelY, p.labelWidth);
    return (
      <g>
        <defs>
          <mask id={gap} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
            <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
            <rect x={gapBox.x} y={gapBox.y} width={gapBox.width} height={gapBox.height} fill="black" />
          </mask>
        </defs>
        <path d={drawing.path} fill="none" stroke={ink} strokeWidth={1.8} mask={`url(#${gap})`} />
        <path
          d="M -9 -4 L 0 0 L -9 4"
          fill="none"
          stroke={ink}
          strokeWidth={1.8}
          transform={`translate(${end.x}, ${end.y}) rotate(${angle})`}
        />
        <text
          x={p.labelX}
          y={p.labelY + 4}
          textAnchor="middle"
          fill={ink}
          stroke={paper}
          strokeWidth={4}
          paintOrder="stroke"
          fontFamily="sans-serif"
          fontSize={11}
          fontStyle="italic"
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
    const drawing = road ? undefined : connectionDrawing(shape, this.editor);
    const label = road || (drawing?.label ? { labelX: drawing.label.x, labelY: drawing.label.y } : shape.props);
    const bounds = this.getGeometry(shape).bounds;
    // Indicators render above shape content. Exclude the label so hover and
    // selection highlights cannot strike through its text.
    const clipPath = new Path2D();
    clipPath.rect(bounds.minX - 100, bounds.minY - 100, bounds.width + 200, bounds.height + 200);
    clipPath.rect(label.labelX - shape.props.labelWidth / 2, label.labelY - 15, shape.props.labelWidth, 30);
    return {
      path: new Path2D(road ? pathFor(road.outline, true) : drawing!.path),
      clipPath,
    };
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
