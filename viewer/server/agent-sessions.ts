import { db } from "./db";
import type { AgentProject } from "./model-service";
import type { AgentScope, AgentSession, AgentLifecycle } from "../shared/agent-session";
import { agentWork } from "./agents/work";

db.exec(`CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, scope TEXT NOT NULL
);`);
if (!(db.query("PRAGMA table_info(agent_tasks)").all() as { name: string }[]).some(column => column.name === "lifecycle")) db.exec("ALTER TABLE agent_tasks ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active'");
interface StoredAgent extends AgentSession { project_id: string }
const rows = (projectId: string) => db.query<StoredAgent, [string]>(
  "SELECT * FROM agent_tasks WHERE project_id = ? ORDER BY rowid",
).all(projectId);
const publicAgent = ({ id, scope, name, lifecycle }: StoredAgent): AgentSession => ({ id, scope, name, lifecycle, contextIds: agentWork.contextIds(id) });
function create(projectId: string, input: { name?: unknown }): AgentSession {
  if (!input || (input.name !== undefined && (typeof input.name !== "string" || input.name.trim().length > 80))) throw new Error("Use a task name of at most 80 characters.");
  const id = crypto.randomUUID(), name = (input.name as string | undefined)?.trim() || "New task";
  db.run("INSERT INTO agent_tasks (id, project_id, name, scope) VALUES (?, ?, ?, 'model')", [id, projectId, name]);
  return { id, scope: "model", name, lifecycle: "active" };
}
export const agentSessions = {
  list(projectId: string): AgentSession[] {
    const agents = rows(projectId);
    return agents.map(publicAgent);
  },
  setLifecycle(id: string, lifecycle: AgentLifecycle) { db.run("UPDATE agent_tasks SET lifecycle = ? WHERE id = ?", [lifecycle, id]); },
  discard(id: string) { db.transaction(() => {
    agentWork.discard(id);
    db.run("DELETE FROM agent_tasks WHERE id = ?", [id]);
  })(); },
  create,
  async assign(project: AgentProject, input: { name?: unknown; contextIds?: unknown }) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["name", "contextIds"].includes(key))) throw new Error("Provide a task name and optional working context IDs.");
    await agentWork.refresh(project);
    return db.transaction(() => {
      const agent = create(project.id, input);
      if (input.contextIds !== undefined) agentWork.setContext(project, agent.id, input.contextIds);
      return { ...agent, contextIds: agentWork.contextIds(agent.id) };
    })();
  },
  scope(project: AgentProject, agentId: string | undefined): AgentProject {
    const agent = rows(project.id).find(agent => agent.id === agentId);
    if (!agent) throw new Error("This agent is unavailable in this project.");
    return { ...project, conversationId: agent.id };
  },
  get(id: string) { return db.query<StoredAgent, [string]>("SELECT * FROM agent_tasks WHERE id = ?").get(id); },
  setScope(id: string, scope: AgentScope) { db.run("UPDATE agent_tasks SET scope = ? WHERE id = ?", [scope, id]); },
  nameTask(id: string, text: string) { db.run("UPDATE agent_tasks SET name = ? WHERE id = ? AND name = 'New task'", [text.trim().slice(0, 80), id]); },
};
