import type { ModelItem } from "./model";

/** A semantic difference rendered temporarily; it never establishes model membership. */
export interface AgentDelta {
  itemId: string;
  kind: "add" | "modify" | "remove";
  before?: ModelItem;
  after?: ModelItem;
  /** Semantic fields that differ between the saved baseline and candidate. */
  fields: string[];
}

/** A validated, unsaved candidate owned by one Model only conversation. */
export interface AgentDraft {
  id: string;
  summary: string;
  createdAt: string;
  revision: string;
  candidateRevision: string;
  changes: AgentDelta[];
  stale: boolean;
  /** The candidate is already saved; only durable receipt/draft finalization remains. */
  approvalPending?: boolean;
  referenceNames?: { before: Record<string, string>; after: Record<string, string> };
  project?: { before: { name: string; description: string }; after: { name: string; description: string } };
  migration?: boolean;
}

export interface AgentWorkState {
  draft?: AgentDraft;
  context: ModelItem[];
  focus?: { itemIds: string[]; action: "inspect" | "edit" | "navigate"; at: string; reported?: boolean };

}

export const emptyAgentWork = (): AgentWorkState => ({ context: [] });
