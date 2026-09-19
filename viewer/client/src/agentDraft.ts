import type { AgentWorkState } from "../../shared/agent-work";
import type { AgentScope } from "../../shared/agent-session";

/** Only a model-only agent has a reviewable overlay. Legacy proposal/effect records are not UI state. */
export function getModelDraft(work: AgentWorkState | undefined, scope: AgentScope = "model") {
  return scope === "model" ? work?.draft : undefined;
}
