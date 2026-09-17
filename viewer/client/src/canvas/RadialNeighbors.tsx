import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditor, useValue, type Editor, type TLShapeId } from "tldraw";
import { planeNeighbors, type PlaneNeighbor } from "../graph/planeNeighbors";
import type { GraphSelection } from "../graph/model";
import { objectAppearance } from "../ObjectName";
import Icon from "../Icon";
import { useReaderHover } from "../ReaderHover";
import { holdNeighborAnchor, neighborAnchors, neighborEdges } from "./NeighborHighlight";
import { canvasPresentation } from "./presentation";
import { radialCandidateBounds, radialPositions, type RadialBox } from "./radial-layout";
import "./radial-neighbors.css";
import { routeObstacles } from "./radial-obstacles";
type Position = { x: number; y: number; dx: number; dy: number; nameSide?: "left" | "right"; nameWidth?: number };

type Neighbors = { source: TLShapeId; origin: GraphSelection; targets: PlaneNeighbor[] };
function readNeighbors(editor: Editor): Neighbors | undefined {
  const view = canvasPresentation(editor).get();
  if (!view.index) return;
  for (const anchor of [...neighborAnchors(editor, false), ...neighborEdges(editor, false)]) {
    const origin = view.vertices.get(anchor.props.graphId)?.selection || view.connections.get(anchor.props.graphId)?.selection;
    if (!origin) continue;
    const targets = planeNeighbors(view.index, origin).filter(target =>
      target.plane !== "source" && (view.plane !== "all" || origin.kind === "item"));
    if (targets.length) return { source: anchor.id, origin, targets };
  }
}

export function RadialNeighbors() {
  const editor = useEditor();
  const enabled = useValue("Cross-dimension navigation", () => !!canvasPresentation(editor).get().onOpenPlane, [editor]);
  return enabled ? <ActiveRadialNeighbors /> : null;
}

function ActiveRadialNeighbors() {
  const editor = useEditor();
  const live = useValue("Cross-dimension neighbors", () => readNeighbors(editor), [editor]);
  const [neighbors, setNeighbors] = useState<Neighbors>();
  const [inside, setInside] = useState(false);
  const [exiting, setExiting] = useState(false);
  useEffect(() => () => holdNeighborAnchor(editor), [editor]);
  useEffect(() => {
    if (live) { setExiting(false); setNeighbors(live); holdNeighborAnchor(editor, live.source); return; }
    if (inside) { setExiting(false); return; }
    const timer = setTimeout(() => setExiting(true), 500);
    return () => clearTimeout(timer);
  }, [editor, live, inside]);
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => { setNeighbors(undefined); holdNeighborAnchor(editor); }, 160);
    return () => clearTimeout(timer);
  }, [editor, exiting]);
  if (!neighbors) return null;
  return <RadialRing key={neighbors.source} exiting={exiting} editor={editor} neighbors={neighbors} onInside={setInside} onNavigate={vertex => {
    setInside(false); setNeighbors(undefined); holdNeighborAnchor(editor);
    canvasPresentation(editor).get().onOpenPlane?.(vertex.selection, neighbors.origin);
  }} />;
}

function RadialRing({ editor, neighbors, exiting, onInside, onNavigate }: {
  editor: Editor; neighbors: Neighbors; exiting: boolean; onInside: (inside: boolean) => void; onNavigate: (vertex: PlaneNeighbor) => void;
}) {
  const [positions, setPositions] = useState<Position[]>([]);
  const hover = useReaderHover("Neighbor Reader preview");
  const labelsKey = JSON.stringify(neighbors.targets.map(({ id, title }) => ({ id, title })));
  useLayoutEffect(() => {
    let frame = 0;
    let lastGeometry = "";
    const routeCache = new WeakMap<SVGPathElement, { key: string; boxes: RadialBox[] }>();
    const labels: { id: string; title: string }[] = JSON.parse(labelsKey);
    let measuredWidth = -1;
    let names: { w: number; h: number }[] = [];
    const measureNames = (width: number) => {
      if (measuredWidth === width) return;
      measuredWidth = width;
      const measure = document.createElement('span');
      measure.className = 'radial-neighbor-name';
      Object.assign(measure.style, { visibility: 'hidden', maxWidth: `${width}px` });
      document.body.appendChild(measure);
      names = labels.map(({ title }) => {
        measure.textContent = title;
        const bounds = measure.getBoundingClientRect();
        return { w: Math.ceil(bounds.width), h: Math.ceil(bounds.height) };
      });
      measure.remove();
    };
    const place = () => {
      const source = editor.getContainer().querySelector(`[data-shape-id="${CSS.escape(neighbors.source)}"] .canvas-object, [data-shape-id="${CSS.escape(neighbors.source)}"] .canvas-connection-label`);
      const bounds = source?.getBoundingClientRect();
      let next: typeof positions = [];
      if (bounds?.width && bounds.height) {
        const box = (b: DOMRect): RadialBox => ({ x: b.x, y: b.y, w: b.width, h: b.height });
        const viewport = editor.getContainer().getBoundingClientRect();
        const x = Math.max(8, viewport.left), y = Math.max(8, viewport.top);
        const availableWidth = Math.max(32, Math.min(window.innerWidth - 8, viewport.right) - x);
        measureNames(Math.max(32, Math.min(360, availableWidth - 38)));
        const candidates = radialCandidateBounds(box(bounds), labels.length, names);
        const obstacles = [...editor.getContainer().querySelectorAll('.canvas-object')].filter(el => el !== source).map(el =>
          box((el.classList.contains('canvas-group') ? el.querySelector('.canvas-object-heading') ?? el : el).getBoundingClientRect()));
        // Include relationship text, arrowheads, and the actual curved/orthogonal routes.
        for (const el of editor.getContainer().querySelectorAll('.canvas-connection-label')) {
          const b = el.getBoundingClientRect();
          if (b.width && b.height) obstacles.push(box(b));
        }
        for (const path of editor.getContainer().querySelectorAll<SVGPathElement>('[data-route-current] > path, .map-road-bank, .map-road-direction')) {
          // Paths outside all candidate icon/name positions contribute zero overlap.
          const b = path.getBoundingClientRect();
          if (b.right + 3 < candidates.x || b.left - 3 > candidates.x + candidates.w ||
              b.bottom + 3 < candidates.y || b.top - 3 > candidates.y + candidates.h) continue;
          const matrix = path.getScreenCTM();
          if (!matrix) continue;
          const key = `${path.getAttribute('d')}:${matrix.toString()}`;
          let cached = routeCache.get(path);
          if (cached?.key !== key) { cached = { key, boxes: routeObstacles(path) }; routeCache.set(path, cached); }
          obstacles.push(...cached.boxes);
        }
        for (const el of document.querySelectorAll('.toolbar, #main-content, .tlui-layout__top, .tlui-layout__bottom')) {
          const b = el.getBoundingClientRect();
          if (b.width && b.height) obstacles.push(box(b));
        }
        const geometry = JSON.stringify([box(bounds), obstacles, box(viewport), window.innerWidth, window.innerHeight, names]);
        if (geometry === lastGeometry) { frame = requestAnimationFrame(place); return; }
        lastGeometry = geometry;
        next = radialPositions(box(bounds), labels.length, obstacles, {
          x, y, w: availableWidth,
          h: Math.max(32, Math.min(window.innerHeight - 8, viewport.bottom) - y),
        }, names).map(p => {
          const dx = bounds.x + bounds.width / 2 - p.x - 15, dy = bounds.y + bounds.height / 2 - p.y - 15;
          const length = Math.hypot(dx, dy) || 1;
          return { ...p, dx: dx / length * 12, dy: dy / length * 12 };
        });
      } else { lastGeometry = ""; }
      setPositions(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      frame = requestAnimationFrame(place);
    };
    place(); return () => cancelAnimationFrame(frame);
  }, [editor, neighbors.source, labelsKey]);
  return createPortal(<div className="radial-neighbors" data-exiting={exiting || undefined} role="group" aria-label="Cross-dimension neighbors" data-view-control
    onPointerEnter={() => onInside(true)} onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) onInside(false); }}
    onFocusCapture={() => onInside(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onInside(false); }}
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {neighbors.targets.map((vertex, i) => positions[i] && <RadialIcon key={vertex.id} vertex={vertex} position={positions[i]} hover={hover.bind(vertex.selection)} onNavigate={() => { hover.dismiss(); onNavigate(vertex); }} />)}
    {hover.preview}
  </div>, document.body);
}

function RadialIcon({ vertex, position, onNavigate, hover }: { vertex: PlaneNeighbor; position: Position; onNavigate: () => void; hover: ReturnType<ReturnType<typeof useReaderHover>["bind"]> }) {
  const left = position.nameSide === "left";
  const room = left ? position.x - 12 : window.innerWidth - position.x - 42;
  const { icon, tone } = objectAppearance(vertex.kind === "file" ? "code" : vertex.kind, vertex.kind === "concept" ? vertex.subtitle : undefined);
  return <button className="radial-neighbor object-name" data-tone={tone} data-radial-node={vertex.id}
    title={vertex.subtitle ? `${vertex.title} · ${vertex.subtitle}` : vertex.title} aria-label={`Go to ${vertex.title}`} data-name-side={left ? "left" : "right"} style={{ left: position.x, top: position.y, "--radial-name-width": `${position.nameWidth ?? Math.max(80, Math.min(360, room))}px`, "--radial-dx": `${position.dx}px`, "--radial-dy": `${position.dy}px` } as CSSProperties}
    {...hover} onClick={onNavigate}>
    <span className="type-icon"><Icon name={icon} size={17} /></span>
    <span className="radial-neighbor-name" aria-hidden="true">{vertex.title}</span>
  </button>;
}
