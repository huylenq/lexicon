import type { CodeLink, ModelItem } from "./model";

export const providers = ["codex", "grok", "claude"] as const;
export type Provider = (typeof providers)[number];
export interface ModelChoice {
  id: string;
  name: string;
  description?: string;
  efforts?: string[];
  defaultEffort?: string;
  fastMode?: { description: string };
}
export interface ModelCatalog {
  models: ModelChoice[];
  defaultModel?: string;
}
export interface ProviderStatus {
  id: Provider;
  installed: boolean;
  authenticated: boolean | null;
  detail: string;
}
export interface ChatContext {
  id: string;
  name: string;
  type: ModelItem["type"];
  codeLinks: CodeLink[];
}
export interface ModelPatch {
  project?: { name?: string; description?: string };
  upsert?: ModelItem[];
  remove?: string[];
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  provider: Provider;
  model?: string;
  effort?: string;
  fast?: boolean;
  tools?: ChatToolCall[];
  finishedAt?: string;
  context?: ChatContext;
  createdAt: string;
  status: "running" | "complete" | "interrupted" | "error";
  change?: {
    added: string[];
    updated: string[];
    removed: string[];
    undone?: boolean;
  };
  error?: string;
}
export interface ChatToolCall {
  id: string;
  title: string;
  kind: string;
  status: "running" | "complete" | "error" | "interrupted";
  input?: string;
  output?: string;
  startedAt: string;
  finishedAt?: string;
}
export type ToolUpdate = Pick<ChatToolCall, "id"> &
  Partial<Omit<ChatToolCall, "id" | "startedAt" | "finishedAt">> & { outputDelta?: string };
export interface ChatQuestion {
  id: string;
  text: string;
  options: string[];
}
export interface ChatState {
  messages: ChatMessage[];
  running: boolean;
  activity: string;
  pending?: { id: string; questions: ChatQuestion[] };
  undoAvailable: boolean;
  revision: number;
}
