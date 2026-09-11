import type { Project } from "../../shared/model";
import { related } from "../../shared/model";
import type { ChatService, ChatProject, TurnLease } from "../chat/service";
import { readModelDocument } from "../model";
import { fingerprint, readXml } from "../chat/model-edit";
import { only, record, text } from "./edit";
import { AgentSessions } from "./sessions";
import { agentTools } from "./tools";

/** The sole operation dispatcher, used by HTTP/MCP and server-bound chat turns. */
export function createAgentOperations(chat: ChatService, resolveProject: (id: string) => Promise<ChatProject>, listProjects: () => Project[], sessions = new AgentSessions()) {
  async function snapshot(project: ChatProject) {
    const xml = await readXml(project.artifactRoot), revision = fingerprint(xml);
    const document = await readModelDocument(project.artifactRoot, xml);
    sessions.modelChanged(project.id, revision);
    return { ...document, revision, sourceRoot: project.root, artifactRoot: project.artifactRoot };
  }
  async function execute(name: string, raw: unknown, lease?: TurnLease): Promise<Record<string, unknown>> {
    const tool = agentTools.find(t => t.name === name);
    if (!tool) throw new Error("Unknown Lexicon tool.");
    const input = record(raw);
    only(input, Object.keys(tool.inputSchema.properties));
    if (name === "lexicon_projects") return ({ projects: listProjects() });
    const project = await resolveProject(text(input.projectId, "project ID"));
    if (name === "lexicon_sessions") return ({ sessions: sessions.list(project.id) });
    if (name === "lexicon_events") {
      await snapshot(project);
      return (sessions.readEvents(project.id, input.cursor === undefined ? undefined : text(input.cursor, "cursor")));
    }
    if (name === "lexicon_edit") {
      const { projectId, revision, ...edit } = input;
      const receipt = await chat.agentCommand(project, text(revision, "model revision"), edit, lease);
      sessions.modelChanged(project.id, receipt.revision);
      return (receipt);
    }
    if (name === "lexicon_undo") {
      await chat.undo(project, text(input.changeId, "change ID"), lease);
      const result = await snapshot(project);
      return ({ revision: result.revision, undoAvailable: chat.state(project.id).undoAvailable });
    }
    const result = await snapshot(project);
    if (name === "lexicon_inspect" && input.itemId === undefined) return (result);
    if (!result.model) throw new Error(result.problem?.message || "Model unavailable.");
    if (name === "lexicon_search") {
      const query = text(input.query, "search query").toLocaleLowerCase();
      const matches = result.model.items.filter(item => JSON.stringify([item.id, item.name, item.description, item.annotations, item.codeLinks]).toLocaleLowerCase().includes(query));
      return ({ revision: result.revision, items: matches.slice(0, 100), total: matches.length });
    }
    if (name === "lexicon_inspect") {
      const item = result.model.items.find(i => i.id === text(input.itemId, "item ID"));
      if (!item) throw new Error("Model item not found.");
      return ({ revision: result.revision, item, relationships: related(result.model, item.id) });
    }
    if (name === "lexicon_navigate") {
      const action = input.action;
      if (action !== "select" && action !== "focus" && action !== "fit") throw new Error("Choose select, focus, or fit.");
      const itemId = action === "fit" ? undefined : text(input.itemId, "item ID");
      if (action === "fit" && input.itemId !== undefined) throw new Error("Fit frames visible model content; omit itemId.");
      const item = result.model.items.find(i => i.id === itemId);
      if (itemId && !item) throw new Error("Model item not found.");
      if (action === "focus" && item?.type === "flow") throw new Error("Flows have no canvas shape. Use select to open the flow in the reader.");
      return ({ session: await sessions.navigate(project.id, text(input.sessionId, "session ID"), action, itemId, lease?.signal) });
    }
    throw new Error("Unsupported Lexicon tool.");
  }
  return { sessions, snapshot, execute };
}
export type AgentOperations = ReturnType<typeof createAgentOperations>;
