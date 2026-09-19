import type { SourceLink, ModelItem } from "./model";

export interface AgentContext {
  id: string;
  name: string;
  type: ModelItem["type"];
  codeLinks: SourceLink[];
}
export interface ModelPatch {
  project?: { name?: string; description?: string };
  upsert?: ModelItem[];
  remove?: string[];
}
export interface ModelChange {
  id: string;
  text: string;
  createdAt: string;
  change: { added: string[]; updated: string[]; removed: string[]; undone?: boolean };
}
