import type { AgentContext } from "./model-edit";

// Lexicon's UI contract. T3's wire protocol and Effect stay in the server adapter.
export interface AgentConnection {
  configured: boolean;
  connected: boolean;
  url: string;
  label?: string;
  error?: string;
  models: { modelOnly?: boolean; instanceId: string; provider: string; id: string; name: string }[];
}
export interface AgentState {
  work?: import("./agent-work").AgentWorkState;
  lifecycle?: import("./agent-session").AgentLifecycle;
  /** Revision ordering applies only within one server generation. */
  generation: string;
  revision: number;
  connected: boolean;
  running: boolean;
  turnState?: string;
  error?: string;
  thread?: { id: string; title: string; branch: string | null; workspace: string; model: string; instanceId: string };
  messages: { id: string; role: string; text: string; streaming: boolean; context?: AgentContext }[];
  activities: { id: string; title: string; kind: string; detail: string; error: boolean }[];
  approvals: { id: string; detail: string; options: { decision: string; label: string; warning?: string }[] }[];
  questions: { id: string; dismissible: boolean; questions: { id: string; text: string; options: { label: string; description?: string }[]; multiple: boolean; custom: boolean }[] }[];
  changes: { path: string; additions: number; deletions: number }[];
  codeReview?: { checkpoint: number; status: "loading" | "ready" | "error"; hasChanges?: boolean; error?: string };
  checkpoint: number;
  scope: "model" | "code";
  receipts: { id: string; messageId?: string; text: string; error?: string; changeId?: string }[];
}
export const emptyAgent = (): AgentState => ({
  generation: "", scope: "model", receipts: [], revision: 0, connected: false, running: false, messages: [], activities: [], approvals: [], questions: [], changes: [], checkpoint: 0,
});
