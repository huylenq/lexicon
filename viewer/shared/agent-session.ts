export type AgentScope = "model" | "code";
export type AgentLifecycle = "active" | "settled" | "archived" | "deleted";
export interface AgentSession {
  lifecycle?: AgentLifecycle;
  bound?: boolean;
  id: string;
  scope: AgentScope;
  name: string;
  contextIds?: string[];
  draft?: { id: string; summary: string; stale: boolean; approvalPending?: boolean };
}
