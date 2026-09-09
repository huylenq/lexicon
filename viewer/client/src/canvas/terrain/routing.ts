import { computed, type Editor } from "tldraw";
import type { Box, Point } from "../../graph/layout";
import type { ObjectShape } from "../../../../shared/canvas-schema";
import { canvasPresentation } from "../presentation";
import { contextFrame, contextLabelFrame, contextTerritory, isContext } from "../contexts";
import { objectFrame } from "../sizing";
import { isPrimary, modelShapeId } from "../references";
import { relationshipRoute } from "../routes";
import { createRelationshipRouter, type SceneRelationship, type SceneObstacles, type SceneObstacle, type RelationshipRoute } from "../scene-routing";
import { borderPort } from "../territory";
import { choice, dockRoad, landmarkFor, landmarkPlacement, paths, type PathKind } from "./generate";
import { villageLandmarkPlacement } from "./village";

type AtlasRoute = { kind: PathKind; points: Point[]; entrances: [boolean, boolean]; labelX: number; labelY: number };
const facadeInset = 2;
const nameplateHeight = 22;
const entranceGap = 1;
const roadLaneSpacing = 40;
const roadPortInset = 0.5;
const roadPadding = 19; // 12px painted bank plus up to 6.3px of centerline drift.
const scenes = new WeakMap<Editor, ReturnType<typeof createAtlasRouting>>();

type Endpoint = { frame: Box; box: Box; landmark?: ReturnType<typeof landmarkPlacement>; coast?: Point[] };
type RoadDetails = { source: Endpoint; target: Endpoint; kind: PathKind };
type AtlasView = ReturnType<ReturnType<typeof canvasPresentation>["get"]>;

function collectLandmarks(editor: Editor, view: AtlasView) {
  const endpoints = new Map<string, Endpoint>(), obstacles: SceneObstacles = { paths: [], labels: [] };
  const addSharedObstacle = (obstacle: SceneObstacle) => {
    obstacles.paths.push(obstacle);
    obstacles.labels.push(obstacle);
  };
  for (const [id, vertex] of view.vertices) {
    const shape = editor.getShape<ObjectShape>(modelShapeId(id));
    if (!shape || shape.type !== "lexicon-object" || !isPrimary(shape) || editor.isShapeHidden(shape)) continue;
    const context = isContext(shape), transform = editor.getShapePageTransform(shape);
    const local = context ? contextFrame(editor, shape, true) : objectFrame(editor, shape, vertex, true);
    const b = { ...transform.applyToPoint(local), w: local.w, h: local.h };
    const frame = { x: b.x, y: b.y, width: b.w, height: b.h };
    if (context) {
      const heading = contextLabelFrame(editor, shape, true);
      addSharedObstacle({ id: `${id}:heading`, ...transform.applyToPoint(heading), width: heading.w, height: heading.h });
      endpoints.set(id, { frame, box: frame, coast: contextTerritory(editor, shape).points.map(p => transform.applyToPoint(p)) });
      continue;
    }
    const kind = vertex.kind === "concept" ? landmarkFor({ classification: vertex.subtitle, landmark: shape.meta.lexiconLandmark }) : "none";
    const landmark = kind === "none" ? undefined : (view.atlasSkin === "village" ? villageLandmarkPlacement : landmarkPlacement)(b, kind);
    const body = landmark?.body;
    const facade = body ? {
      x: body.x + facadeInset, y: body.y + facadeInset,
      width: body.w - facadeInset * 2, height: body.h - facadeInset * 2,
    } : frame;
    endpoints.set(id, { frame, landmark, box: facade });
    if (!shape.props.group) {
      addSharedObstacle({ id, ...frame });
      // Facades accept their own roads, but labels must clear the whole illustration.
      if (body) {
        obstacles.labels.push({ id: `${id}:art`, ...frame });
        const nameplateTop = frame.y + frame.height - nameplateHeight;
        const facadeBottom = body.y + body.h - facadeInset;
        // Preserve an exit between the facade and its own nameplate.
        const nameplatePadding = Math.min(roadPadding, Math.max(0, nameplateTop - facadeBottom - entranceGap));
        addSharedObstacle({
          id: `${id}:name`, x: frame.x, y: nameplateTop,
          width: frame.width, height: nameplateHeight, padding: nameplatePadding,
        });
      }
    }
  }
  return { endpoints, obstacles };
}

function snapToFacade(p: Point, box: Box) {
  const sides = [{ ...p, x: box.x }, { ...p, x: box.x + box.width }, { ...p, y: box.y }, { ...p, y: box.y + box.height }];
  return sides.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
}

function dockedRoute(source: Endpoint, target: Endpoint, lane: number, self: boolean) {
  const seed = relationshipRoute(source.frame, target.frame, lane, self);
  const docked = dockRoad(seed.points, source.landmark, target.landmark, self);
  docked[0] = snapToFacade(docked[0], source.box);
  docked[docked.length - 1] = snapToFacade(docked.at(-1)!, target.box);
  const preferred: Point[] = [];
  for (const p of docked) {
    const last = preferred.at(-1);
    if (last && last.x !== p.x && last.y !== p.y) preferred.push({ x: p.x, y: last.y });
    preferred.push(p);
  }
  return preferred;
}

function collectRoads(editor: Editor, view: AtlasView, endpoints: Map<string, Endpoint>) {
  const edges: SceneRelationship[] = [], details = new Map<string, RoadDetails>();
  for (const edge of view.connections.values()) {
    const shape = editor.getShape(modelShapeId(edge.id));
    if (edge.kind !== "relationship" || shape?.type !== "lexicon-connection" || !isPrimary(shape) || editor.isShapeHidden(shape)) continue;
    const kind = choice(shape.meta.lexiconPath, paths, "road");
    if (kind === "none") continue;
    const source = endpoints.get(edge.source), target = endpoints.get(edge.target);
    if (!source || !target) continue;
    const lane = Number(shape.meta.lexiconLane) || 0;
    const preferred = dockedRoute(source, target, lane, edge.source === edge.target);
    edges.push({ id: edge.id, sourceId: edge.source, targetId: edge.target, source: source.box, target: target.box,
      lane, labelWidth: shape.props.labelWidth, preferred, spacing: roadLaneSpacing, portInset: roadPortInset, strokePadding: roadPadding });
    details.set(edge.id, { source, target, kind });
  }
  return { edges, details };
}

function attachCoasts(route: RelationshipRoute, details: RoadDetails): AtlasRoute {
  const { source, target, kind } = details;
  const points = route.points.map(p => ({ ...p }));
  if (source.coast) points[0] = borderPort(source.coast, points[1]);
  if (target.coast) points[points.length - 1] = borderPort(target.coast, points.at(-2)!);
  return { kind, points, entrances: [!!source.landmark, !!target.landmark], labelX: route.x, labelY: route.y };
}

/** One page-space scene feeds paint, native hit geometry, labels, and terrain. */
function createAtlasRouting(editor: Editor) {
  const router = createRelationshipRouter();
  let previousKey = "", previous = new Map<string, AtlasRoute>();
  return computed("Atlas relationship routes", () => {
    const view = canvasPresentation(editor).get();
    if (!view.mapEnabled) return new Map<string, AtlasRoute>();
    const { endpoints, obstacles } = collectLandmarks(editor, view);
    const { edges, details } = collectRoads(editor, view, endpoints);
    const dragging = editor.inputs.getIsDragging();
    const key = JSON.stringify([edges, obstacles, [...details].map(([id, d]) => [id, d.kind, d.source.coast, d.target.coast]), dragging]);
    if (key === previousKey) return previous;
    const routes = router.route(edges, obstacles, dragging);
    const result = new Map([...routes].map(([id, route]) => [id, attachCoasts(route, details.get(id)!)]));
    previousKey = key;
    previous = result;
    return result;
  });
}

export function atlasRoad(editor: Editor, id: string) {
  let scene = scenes.get(editor);
  if (!scene) { scene = createAtlasRouting(editor); scenes.set(editor, scene); }
  return scene.get().get(id);
}
