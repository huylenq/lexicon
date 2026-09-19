import { db } from "../db";
import { modelDocuments } from "../model-documents";
import type { Model, ModelItem } from "../../shared/model";
import type { AgentWorkState } from "../../shared/agent-work";
import type { AgentProject } from "../model-service";

/** Context and attention are presentation data, never semantic ownership. */
interface StoredWork {
  contextIds: string[];
  context: ModelItem[];
  focus?: AgentWorkState["focus"];
}
db.exec("CREATE TABLE IF NOT EXISTS agent_work (agent_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, state TEXT NOT NULL)");
// Retire prototype provenance while preserving each task's context and focus.
db.exec("UPDATE agent_work SET state = json_remove(state, '$.proposal', '$.previousProposals', '$.events', '$.applied') WHERE json_type(state, '$.events') IS NOT NULL OR json_type(state, '$.proposal') IS NOT NULL OR json_type(state, '$.previousProposals') IS NOT NULL OR json_type(state, '$.applied') IS NOT NULL");
const models = new Map<string, Model | undefined>();
const revisions = new Map<string, string>();
const cache = new Map<string, { source: string; work: StoredWork; model?: Model; state?: AgentWorkState }>();
function cached(id: string) {
  const source = db.query<{ state: string }, [string]>("SELECT state FROM agent_work WHERE agent_id = ?").get(id)?.state || '{"contextIds":[],"context":[]}';
  let value = cache.get(id);
  if (!value || value.source !== source) {
    value = { source, work: JSON.parse(source) as StoredWork };
  }
  cache.delete(id);
  cache.set(id, value);
  let characters = [...cache.values()].reduce((sum, entry) => sum + entry.source.length, 0);
  while (cache.size > 64 || characters > 4_000_000) {
    const oldest = cache.keys().next().value!;
    characters -= cache.get(oldest)!.source.length;
    cache.delete(oldest);
  }
  return value;
}
function stored(id: string): StoredWork { return { ...cached(id).work }; }
function save(projectId: string, id: string, work: StoredWork) {
  db.run("INSERT OR REPLACE INTO agent_work VALUES (?, ?, ?)", [id, projectId, JSON.stringify(work)]);
  cache.delete(id);
}
function ids(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > 100 || raw.some(id => typeof id !== "string" || !id.trim() || id.length > 500)) throw new Error("Provide up to 100 model item IDs.");
  return [...new Set(raw)] as string[];
}
function available(model: Model | undefined, raw: unknown) {
  const wanted = ids(raw);
  if (wanted.some(id => !model?.items.some(item => item.id === id))) throw new Error("A working-context item is no longer available. Refresh the model.");
  return wanted;
}
export const agentWork = {
  revision(projectId: string) { return revisions.get(projectId); },
  contextIds(id: string) { return cached(id).work.contextIds; },
  discard(id: string) { db.run("DELETE FROM agent_work WHERE agent_id = ?", [id]); cache.delete(id); },
  observe(projectId: string, model: Model | undefined, revision: string) { models.set(projectId, model); revisions.set(projectId, revision); },
  async refresh(project: AgentProject) {
    const { document, revision } = await modelDocuments.read(project.artifactRoot);
    if (revisions.get(project.id) !== revision) this.observe(project.id, document.model, revision);
  },
  state(projectId: string, id: string): AgentWorkState {
    const value = cached(id), model = models.get(projectId);
    if (value.state && value.model === model) return value.state;
    const work = value.work, byId = new Map((model?.items || []).map(item => [item.id, item]));
    value.model = model;
    value.state = { context: work.contextIds.flatMap(id => { const item = byId.get(id) || work.context.find(item => item.id === id); return item ? [item] : []; }), focus: work.focus };
    return value.state;
  },
  setContext(project: AgentProject, id: string, raw: unknown) {
    const model = models.get(project.id), contextIds = available(model, raw), work = stored(id);
    work.contextIds = contextIds;
    work.context = contextIds.map(id => model!.items.find(item => item.id === id)!);
    save(project.id, id, work);
  },
  focus(project: AgentProject, id: string, itemIds: string[], action: "inspect" | "edit" | "navigate") {
    const work = stored(id);
    work.focus = { itemIds, action, at: new Date().toISOString() };
    save(project.id, id, work);
  },
  update(project: AgentProject, id: string, input: { contextIds?: unknown; focus?: unknown }, candidate?: Model) {
    const model = candidate || models.get(project.id), work = stored(id);
    if (input.contextIds !== undefined) {
      work.contextIds = available(model, input.contextIds);
      work.context = work.contextIds.map(id => model!.items.find(item => item.id === id)!);
    }
    if (input.focus !== undefined) {
      const focus = input.focus as { itemIds?: unknown; action?: unknown };
      if (!focus || typeof focus !== "object" || Object.keys(focus).some(key => !["itemIds", "action"].includes(key)) || !["inspect", "edit", "navigate"].includes(String(focus.action))) throw new Error("Choose inspect, edit, or navigate for focus.");
      work.focus = { itemIds: available(model, focus.itemIds), action: focus.action as "inspect", reported: true, at: new Date().toISOString() };
    }
    save(project.id, id, work);
    return this.state(project.id, id);
  },
};

/** Tool echoes identify attention; inspect fetches current semantic details on demand. */
export function workReceipt(taskId: string, work: AgentWorkState) {
  const bounded = (values: string[], budget = 6_000): string[] => {
    const result: string[] = []; let size = 0;
    for (const value of values) {
      const length = JSON.stringify(value).length;
      if (result.length === 20 || size + length > budget) break;
      result.push(value); size += length;
    }
    return result;
  };
  return {
    taskId,
    context: { total: work.context.length, itemIds: bounded(work.context.map(item => item.id)) },
    focus: work.focus && { ...work.focus, itemIds: bounded(work.focus.itemIds), total: work.focus.itemIds.length },
    detail: "Lists show up to 20 items within the response budget. Use lexicon_inspect for current item details.",
  };
}
