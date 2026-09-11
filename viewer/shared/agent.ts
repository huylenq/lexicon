/** Application operations shared by the viewer bridge and external integrations. */
export interface ViewerState {
  selection: { kind: "item" | "code" | "mapping"; id: string } | { kind: "bundle"; relationships: string[]; mappings: string[] } | null;
  view: "canvas" | "reader" | "code" | "unavailable";
  modelRevision: string;
}
export interface ViewerSession extends ViewerState {
  id: string;
  projectId: string;
  updatedAt: number;
  connected: boolean;
}
export interface NavigationCommand {
  id: string;
  action: "select" | "focus" | "fit";
  itemId?: string;
  expiresAt: number;
}
export interface AgentEvent {
  sequence: number;
  projectId: string;
  type: "session.changed" | "session.closed" | "model.changed" | "operation.completed" | "operation.failed";
  session?: ViewerSession;
  revision?: string;
  operationId?: string;
  error?: string;
}
export type ViewerMessage =
  | { type: "command"; command: NavigationCommand }
  | { type: "cancel"; operationId: string }
  | { type: "refresh"; revision: string }
  | { type: "ready" };
