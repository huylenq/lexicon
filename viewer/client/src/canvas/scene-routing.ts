import type { Box, Point } from "../graph/layout";
import { routeRuns, segmentBlocked, expand, clearance, type Run } from "./obstacle-routing";
import { relationshipRoute } from "./routes";
import { clearRouteLabel, labelBox } from "./route-labels";

export type SceneRelationship = {
  id: string; sourceId: string; targetId: string;
  source: Box; target: Box; lane: number; labelWidth: number;
  preferred?: Point[]; spacing?: number; portInset?: number; strokePadding?: number;
};
export type SceneObstacle = Box & { id: string; padding?: number };
export type SceneObstacles = { paths: SceneObstacle[]; labels: SceneObstacle[] };
// A single collection is convenient when the same objects block paths and labels.
type ObstacleInput = SceneObstacle[] | SceneObstacles;
export type RelationshipRoute = ReturnType<typeof relationshipRoute>;

type CachedRoute = { input: string; route: RelationshipRoute };
export type RoutingStats = { reused: number; routed: number };
const inputKey = (edge: SceneRelationship) => JSON.stringify(edge);

/** Keep clear routes during gestures; a settled pass remains deterministic for saves and undo. */
export function createRelationshipRouter() {
  let previous = new Map<string, CachedRoute>();
  const stats: RoutingStats = { reused: 0, routed: 0 };
  return {
    stats,
    route(edges: SceneRelationship[], obstacles: ObstacleInput, incremental = false) {
      const result = routeRelationships(edges, obstacles, incremental ? previous : undefined, stats);
      previous = new Map(edges.map(edge => [edge.id, { input: inputKey(edge), route: result.get(edge.id)! }]));
      return result;
    },
  };
}

const defaultPortInset = 8;
const approachPadding = 5;
const minimumLabelCorridor = 40;
const labelCorridorPadding = 8;
const selfLoopEntranceGap = 1;
type PortPair = [Point, Point];
type Reservations = { runs: Run[]; labels: Box[] };

function allocatePorts(edges: SceneRelationship[]) {
  const ports = new Map<string, [Point, Point]>();
  type Port = { edge: SceneRelationship; end: 0 | 1; box: Box; point: Point; verticalSide: boolean; order: number };
  const sides = new Map<string, Port[]>();
  for (const edge of edges) {
    const base = edge.preferred ? { points: edge.preferred } : relationshipRoute(edge.source, edge.target, edge.lane, edge.sourceId === edge.targetId);
    const pair: [Point, Point] = [base.points[0], base.points.at(-1)!];
    ports.set(edge.id, pair);
    for (const end of [0, 1] as const) {
      const box = end ? edge.target : edge.source, other = end ? edge.source : edge.target, point = pair[end];
      const side = point.x === box.x ? "left" : point.x === box.x + box.width ? "right" : point.y === box.y ? "top" : "bottom";
      const verticalSide = side === "left" || side === "right";
      const key = JSON.stringify([end ? edge.targetId : edge.sourceId, side]);
      const list = sides.get(key) || [];
      list.push({ edge, end, box, point, verticalSide, order: verticalSide ? other.y + other.height / 2 : other.x + other.width / 2 });
      sides.set(key, list);
    }
  }
  for (const list of sides.values()) {
    if (list.length === 1) continue;
    list.sort((a, b) => a.order - b.order || (a.edge.id < b.edge.id ? -1 : a.edge.id > b.edge.id ? 1 : a.end - b.end));
    list.forEach((port, i) => {
      const { box, verticalSide } = port;
      const size = verticalSide ? box.height : box.width;
      const inset = Math.min(...list.map(p => p.edge.portInset ?? defaultPortInset), size / 4);
      const position = inset + (size - 2 * inset) * i / (list.length - 1);
      ports.get(port.edge.id)![port.end] = verticalSide
        ? { x: port.point.x, y: box.y + position }
        : { x: box.x + position, y: port.point.y };
    });
  }
  return ports;
}

function approachObstacles(edges: SceneRelationship[], ports: Map<string, PortPair>) {
  const approaches: Box[] = [];
  for (const edge of edges) for (const end of [0, 1] as const) {
    const p = ports.get(edge.id)![end], box = end ? edge.target : edge.source;
    const q = { x: p.x + (p.x === box.x ? -clearance : p.x === box.x + box.width ? clearance : 0),
      y: p.y + (p.y === box.y ? -clearance : p.y === box.y + box.height ? clearance : 0) };
    approaches.push({ x: Math.min(p.x, q.x) - approachPadding, y: Math.min(p.y, q.y) - approachPadding,
      width: Math.abs(q.x - p.x) + approachPadding * 2, height: Math.abs(q.y - p.y) + approachPadding * 2 });
  }
  return approaches;
}

function obstaclesForEdge(edge: SceneRelationship, obstacles: SceneObstacles): SceneObstacles {
  const unrelated = (obstacle: SceneObstacle) => obstacle.id !== edge.sourceId && obstacle.id !== edge.targetId;
  return { paths: obstacles.paths.filter(unrelated), labels: obstacles.labels.filter(unrelated) };
}

function reusableRoute(edge: SceneRelationship, pair: PortPair, obstacles: SceneObstacles, approaches: Box[], cached?: CachedRoute) {
  if (!cached || cached.input !== inputKey(edge)) return;
  const route = cached.route;
  if (JSON.stringify([route.points[0], route.points.at(-1)]) !== JSON.stringify(pair)) return;
  const padded = obstacles.paths.map(expand);
  if (routeRuns(route.points).some(run => segmentBlocked(run.a, run.b, padded))) return;
  const label = clearRouteLabel(route.points, edge.labelWidth,
    [...obstacles.labels, edge.source, edge.target, ...approaches], [], route);
  if (label && label.x === route.x && label.y === route.y) return route;
}

/** Keep a self-loop wide enough for text; this blocks paths only. */
function selfLoopObstacle(edge: SceneRelationship, [a, b]: PortPair): (Box & { padding: number })[] {
  if (edge.sourceId !== edge.targetId || a.x !== b.x || a.y === b.y) return [];
  const reach = edge.labelWidth / 2 + minimumLabelCorridor + (edge.strokePadding ?? 0);
  return [{
    x: a.x === edge.source.x ? a.x - reach : a.x - selfLoopEntranceGap,
    y: Math.min(a.y, b.y) + selfLoopEntranceGap,
    width: reach + selfLoopEntranceGap,
    height: Math.max(0, Math.abs(a.y - b.y) - selfLoopEntranceGap * 2),
    padding: 0,
  }];
}

function routeWithLabel(edge: SceneRelationship, ports: PortPair, obstacles: SceneObstacles, approaches: Box[], reserved: Reservations) {
  const { runs, labels } = reserved;
  const padding = edge.strokePadding ?? 0;
  const barriers = labels.map(box => expand({ ...box, padding }));
  const pathObstacles = [...obstacles.paths, ...selfLoopObstacle(edge, ports)];
  const labelObstacles = [...obstacles.labels, edge.source, edge.target, ...approaches, ...labels];
  const options = { preferred: edge.preferred, spacing: edge.spacing, ports, runs, labels, barriers };
  const self = edge.sourceId === edge.targetId;
  let route = relationshipRoute(edge.source, edge.target, edge.lane, self, pathObstacles, edge.labelWidth, options);
  let label = clearRouteLabel(route.points, edge.labelWidth, labelObstacles, runs);
  if (!label) {
    // One bounded retry can widen a corridor to make room for text.
    const wider = relationshipRoute(edge.source, edge.target, edge.lane, self, pathObstacles, edge.labelWidth,
      { ...options, forceSearch: true, spacing: Math.max(minimumLabelCorridor, edge.labelWidth / 2 + labelCorridorPadding) });
    label = clearRouteLabel(wider.points, edge.labelWidth, labelObstacles, runs);
    if (label) route = wider;
  }
  return label ? { ...route, ...label } : route;
}

/** Allocate ports, retain valid routes, then route affected edges in stable order. */
export function routeRelationships(edges: SceneRelationship[], input: ObstacleInput, previous?: Map<string, CachedRoute>, stats?: RoutingStats) {
  if (stats) { stats.reused = 0; stats.routed = 0; }
  const obstacles = Array.isArray(input) ? { paths: input, labels: input } : input;
  const sorted = [...edges].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ports = allocatePorts(sorted);
  const approaches = approachObstacles(sorted, ports);
  const perEdge = new Map(sorted.map(edge => [edge.id, obstaclesForEdge(edge, obstacles)]));
  const routes = new Map<string, RelationshipRoute>();
  const reserved: Reservations = { runs: [], labels: [] };
  const reserve = (edge: SceneRelationship, route: RelationshipRoute) => {
    routes.set(edge.id, route);
    reserved.runs.push(...routeRuns(route.points).map(run => ({ ...run, padding: edge.strokePadding })));
    reserved.labels.push(labelBox(route, edge.labelWidth));
  };
  // Reserve every unaffected route before routing changed edges around it.
  for (const edge of sorted) {
    const route = reusableRoute(edge, ports.get(edge.id)!, perEdge.get(edge.id)!, approaches, previous?.get(edge.id));
    if (!route) continue;
    reserve(edge, route);
    if (stats) stats.reused++;
  }
  for (const edge of sorted) {
    if (routes.has(edge.id)) continue;
    reserve(edge, routeWithLabel(edge, ports.get(edge.id)!, perEdge.get(edge.id)!, approaches, reserved));
    if (stats) stats.routed++;
  }
  return new Map(sorted.map(edge => [edge.id, routes.get(edge.id)!]));
}
