import { routeRelationships, type CachedRoute, type ObstacleInput, type RelationshipRoute, type SceneRelationship } from "./scene-routing";

export type RoutingRequest = {
  id: number;
  edges: SceneRelationship[];
  obstacles: ObstacleInput;
  previous?: Map<string, CachedRoute>;
};
export type RoutingReply = { id: number; routes: Map<string, RelationshipRoute>; error?: string };

/** This computation runs in the worker; its cache comes from the last accepted result. */
export function runRoutingJob(request: RoutingRequest): RoutingReply {
  try {
    return { id: request.id, routes: routeRelationships(request.edges, request.obstacles, request.previous) };
  } catch (error) {
    return { id: request.id, routes: new Map(), error: String(error) };
  }
}
