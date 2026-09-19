import type { Project } from "../../shared/model";
import { related } from "../../shared/model";
import type { ModelService, AgentProject } from "../model-service";
import { readModelDocument } from "../model";
import { fingerprint, readXml } from "../model-edit";
import { only, record, text, xmlCandidate } from "./edit";
import { AgentSessions } from "./sessions";
import { agentSessions } from "../agent-sessions";
import { agentWork, workReceipt } from "../agents/work";
import { agentTools } from "./tools";
import { agentDrafts } from "../agents/drafts";
import * as log from "../log";

/** The sole operation dispatcher, used only through MCP for agents and internally by the application. */
export function createAgentOperations(chat: ModelService, resolveProject: (id: string) => Promise<AgentProject>, listProjects: () => Project[], sessions = new AgentSessions()) {
  async function snapshot(project: AgentProject) {
    const xml = await readXml(project.artifactRoot), revision = fingerprint(xml);
    const document = await readModelDocument(project.artifactRoot, xml);
    sessions.modelChanged(project.id, revision);
    agentWork.observe(project.id, document.model, revision);
    return { ...document, revision, sourceRoot: project.root, artifactRoot: project.artifactRoot };
  }
  async function dispatch(name: string, raw: unknown, lease?: { signal?: AbortSignal; taskId?: string; messageId?: string; scope?: "model" | "code" }): Promise<Record<string, unknown>> {
    const tool = agentTools.find(t => t.name === name);
    if (!tool) throw new Error("Unknown Lexicon tool.");
    const input = record(raw);
    only(input, Object.keys(tool.inputSchema.properties));
    if (name === "lexicon_projects") return ({ projects: listProjects() });
    let project = await resolveProject(text(input.projectId, "project ID"));
    const taskId = lease?.taskId || (input.taskId === undefined ? undefined : text(input.taskId, "task ID"));
    if (lease?.scope && !taskId) throw new Error("A bound Lexicon turn requires its originating agent task.");
    if (taskId) project = { ...agentSessions.scope(project, taskId), messageId: lease?.messageId };
    const scope = lease?.scope || (taskId ? agentSessions.get(taskId)?.scope : undefined);
    const draftMode = scope === "model" && !!taskId;
    if (scope === "code" && taskId && ["lexicon_edit", "lexicon_patch", "lexicon_migrate"].includes(name) && agentDrafts.state(project.id, taskId))
      throw new Error("Apply or discard the pending model delta before editing in Code + model.");
    const inspect = async () => {
      const saved = await snapshot(project);
      return draftMode ? agentDrafts.snapshot(project) : saved;
    };
    if (name === "lexicon_work") {
      if (!taskId) throw new Error("Choose a task ID for its context and focus.");
      const current = await inspect();
      return { revision: current.revision, work: workReceipt(taskId, agentWork.update(project, taskId, input, current.model)) };
    }
    if (name === "lexicon_sessions") return ({ sessions: sessions.list(project.id), tasks: agentSessions.list(project.id) });
    if (name === "lexicon_events") {
      await snapshot(project);
      return (sessions.readEvents(project.id, input.cursor === undefined ? undefined : text(input.cursor, "cursor")));
    }
    if (name === "lexicon_edit") {
      const { projectId, taskId: _taskId, revision, ...edit } = input;
      if (draftMode) return agentDrafts.stage(project, text(revision, "model revision"), { edit }, lease?.signal);
      const receipt = await chat.agentCommand(project, text(revision, "model revision"), edit, lease?.signal);
      sessions.modelChanged(project.id, receipt.revision);
      if (taskId && receipt.affectedIds.length) agentWork.focus(project, taskId, receipt.affectedIds, "edit");
      const { undoAvailable, ...saved } = receipt;
      return { ...saved, ...(!taskId ? { undoAvailable } : {}), status: "saved" };
    }
    if (name === "lexicon_patch" || name === "lexicon_migrate") {
      if (draftMode) return agentDrafts.stage(project, text(input.revision, "model revision"), name === "lexicon_patch" ? { patch: input.patch } : { migration: xmlCandidate(input.xml) }, lease?.signal);
      const receipt = await chat.patch(project, text(input.revision, "model revision"), name === "lexicon_patch"
        ? { patch: input.patch as import("../../shared/model-edit").ModelPatch }
        : { migration: xmlCandidate(input.xml) }, crypto.randomUUID(), lease?.signal);
      sessions.modelChanged(project.id, receipt.revision);
      if (taskId && receipt.affectedIds.length) agentWork.focus(project, taskId, receipt.affectedIds, "edit");
      const { undoAvailable, ...saved } = receipt;
      return { ...saved, ...(!taskId ? { undoAvailable } : {}), status: "saved" };
    }
    if (name === "lexicon_undo") {
      if (taskId) throw new Error("Agent conversations do not offer model undo. Review pending Model only deltas in the canvas, or use T3 Code checkpoints for coding work.");
      await chat.undo(project, text(input.changeId, "change ID"), lease?.signal);
      const result = await snapshot(project);
      return ({ revision: result.revision, undoAvailable: chat.state(project.id).undoAvailable });
    }
    const result = await inspect();
    const draftInfo = "savedRevision" in result ? { savedRevision: result.savedRevision, ...("draftId" in result ? { draftId: result.draftId, unsaved: "unsaved" in result && result.unsaved, stale: "stale" in result && result.stale } : {}) } : {};
    if (name === "lexicon_inspect" && input.itemId === undefined) {
      const offset = input.offset === undefined ? 0 : input.offset, limit = input.limit === undefined ? 50 : input.limit;
      if (!Number.isInteger(offset) || Number(offset) < 0 || !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) throw new Error("Choose a nonnegative offset and limit from 1 to 100.");
      if (!result.model) return result;
      if (taskId) agentWork.focus(project, taskId, result.model.items.slice(Number(offset), Number(offset) + Number(limit)).map(item => item.id), "inspect");
      const { items, ...model } = result.model;
      return { ...result, model: { ...model, items: items.slice(Number(offset), Number(offset) + Number(limit)) }, totalItems: items.length, nextOffset: Number(offset) + Number(limit) < items.length ? Number(offset) + Number(limit) : null };
    }
    if (!result.model) throw new Error(result.problem?.message || "Model unavailable.");
    if (name === "lexicon_search") {
      const query = text(input.query, "search query").toLocaleLowerCase();
      const matches = result.model.items.filter(item => JSON.stringify([item.id, item.name, item.description, item.annotations, item.codeLinks]).toLocaleLowerCase().includes(query));
      if (taskId) agentWork.focus(project, taskId, matches.slice(0, 100).map(item => item.id), "inspect");
      return ({ revision: result.revision, ...draftInfo, items: matches.slice(0, 100), total: matches.length });
    }
    if (name === "lexicon_inspect") {
      const item = result.model.items.find(i => i.id === text(input.itemId, "item ID"));
      if (!item) throw new Error("Model item not found.");
      if (taskId) agentWork.focus(project, taskId, [item.id], "inspect");
      return ({ revision: result.revision, ...draftInfo, item, relationships: related(result.model, item.id) });
    }
    if (name === "lexicon_navigate") {
      const action = input.action;
      if (action !== "select" && action !== "focus" && action !== "fit") throw new Error("Choose select, focus, or fit.");
      const itemId = action === "fit" ? undefined : text(input.itemId, "item ID");
      if (action === "fit" && input.itemId !== undefined) throw new Error("Fit frames visible model content; omit itemId.");
      const item = result.model.items.find(i => i.id === itemId);
      if (itemId && !item) throw new Error("Model item not found.");
      if (action === "focus" && item?.type === "flow") throw new Error("Flows have no canvas shape. Use select to open the flow in the reader.");
      const session = await sessions.navigate(project.id, text(input.sessionId, "session ID"), action, itemId, lease?.signal);
      if (taskId) agentWork.focus(project, taskId, itemId ? [itemId] : [], "navigate");
      return { session };
    }
    throw new Error("Unsupported Lexicon tool.");
  }
  async function execute(name: string, raw: unknown, lease?: { signal?: AbortSignal; taskId?: string; messageId?: string; scope?: "model" | "code" }): Promise<Record<string, unknown>> {
    const started = performance.now();
    const projectId = raw && typeof raw === "object" && typeof (raw as { projectId?: unknown }).projectId === "string"
      ? (raw as { projectId: string }).projectId : undefined;
    try {
      const result = await dispatch(name, raw, lease);
      log.finish("info", "mcp", {
        msg: "tool", name, projectId, taskId: lease?.taskId, messageId: lease?.messageId,
        ...(typeof result.status === "string" ? { status: result.status } : {}),
        ...(typeof result.revision === "string" ? { revision: result.revision } : {}),
        ...(typeof result.changeId === "string" ? { changeId: result.changeId } : {}),
      }, started);
      return result;
    } catch (error) {
      log.error("mcp", { msg: "tool", name, projectId, taskId: lease?.taskId, messageId: lease?.messageId, error: (error as Error).message, ms: Math.round(performance.now() - started) });
      throw error;
    }
  }
  return { sessions, snapshot, execute };
}
export type AgentOperations = ReturnType<typeof createAgentOperations>;
