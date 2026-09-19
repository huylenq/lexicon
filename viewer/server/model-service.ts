import { realpath } from "node:fs/promises";
import { db } from "./db";
import { emptyModel, parseModel, readModelDocument, serializeModel } from "./model";
import { readCanvasCommand, canvasModelEdit } from "./canvas-command";
import { agentModelEdit } from "./agent/edit";
import { applyPatch, changes, fingerprint, migrationModel, readXml, saveXml, validateChangedLinks } from "./model-edit";
import type { Model } from "../shared/model";
import type { ModelChange, ModelPatch } from "../shared/model-edit";
import { agentWork } from "./agents/work";
import { modelDeltas } from "./model-delta";
import { migrationGuide } from "./model-migrations";

export interface AgentProject { id: string; root: string; artifactRoot: string; example: boolean; conversationId?: string; messageId?: string }
export const conversationKey = (project: AgentProject) => project.conversationId || project.id;
interface Undo { taskId?: string; messageId: string; root: string; before: string | null; after: string }
interface History { changes: ModelChange[]; undo: Undo[]; revision: number }
interface ModelReceipt { changeId: string; revision: string; affectedIds: string[]; warnings: string[]; undoAvailable: boolean }
interface Approval {
  projectId: string; taskId: string; root: string; sourceRoot: string;
  beforeRevision: string; candidateRevision: string; warnings: string[]; receipt?: ModelReceipt;
}
db.exec(`CREATE TABLE IF NOT EXISTS model_changes (project_id TEXT PRIMARY KEY, state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_approvals (id TEXT PRIMARY KEY, state TEXT NOT NULL);`);

/** Semantic edits belong to Lexicon; this service has no provider or conversation runtime. */
export class ModelService {
  private locks = new Set<string>();
  private stored(id: string): History {
    const row = db.query<{ state: string }, [string]>("SELECT state FROM model_changes WHERE project_id = ?").get(id);
    if (row) return JSON.parse(row.state);
    const history: History = { changes: [], undo: [], revision: 0 };
    this.save(id, history);
    return history;
  }
  private save(id: string, history: History) {
    history.revision++;
    db.run("INSERT OR REPLACE INTO model_changes VALUES (?, ?)", [id, JSON.stringify(history)]);
  }
  state(id: string) {
    const history = this.stored(id);
    return { changes: history.changes, undoAvailable: !!history.undo.length, revision: history.revision };
  }
  latest(id: string) { return this.stored(id).undo.at(-1)?.messageId; }
  canUndo(id: string, taskId: string) { return this.stored(id).undo.at(-1)?.taskId === taskId; }
  private approval(id: string): Approval | undefined {
    const row = db.query<{ state: string }, [string]>("SELECT state FROM model_approvals WHERE id = ?").get(id);
    return row ? JSON.parse(row.state) : undefined;
  }
  hasApproval(projectId: string, taskId: string, id: string, candidateRevision: string) {
    const approval = this.approval(id);
    return !!approval && approval.projectId === projectId && approval.taskId === taskId && approval.candidateRevision === candidateRevision;
  }
  async approvalReceipt(project: AgentProject, id: string) {
    const approval = this.approval(id);
    if (!approval?.receipt || approval.projectId !== project.id || approval.taskId !== project.conversationId) return;
    if (approval.root !== await realpath(project.artifactRoot) || approval.sourceRoot !== await realpath(project.root)) throw new Error("This approval belongs to a different checkout or artifact root.");
    return approval.receipt;
  }
  workingOn(root: string) { return this.locks.has(root); }
  private async locked<T>(project: AgentProject, action: (root: string) => Promise<T>) {
    if (project.example) throw new Error("The built-in example is read-only. Add your own project to refine its model.");
    const root = await realpath(project.artifactRoot);
    if (this.locks.has(root)) throw new Error("Wait for the current model edit to finish.");
    this.locks.add(root);
    try { return await action(root); } finally { this.locks.delete(root); }
  }
  private recordCommit(project: AgentProject, root: string, before: string | null, after: string, model: Model, next: Model, text: string, id: string) {
    const history = this.stored(project.id);
    if (history.changes.some(change => change.id === id)) return;
    history.undo.push({ taskId: project.conversationId, messageId: id, root, before, after });
    history.changes.push({ id, text, createdAt: new Date().toISOString(), change: changes(model, next) });
    this.save(project.id, history);
  }
  private receipt(model: Model, next: Model, after: string, id: string, warnings: string[]): ModelReceipt {
    return { changeId: id, revision: fingerprint(after), affectedIds: modelDeltas(model.items, next.items).map(change => change.itemId), warnings, undoAvailable: true };
  }
  private async commit(project: AgentProject, root: string, before: string | null, model: Model, next: Model, text: string, id: string = crypto.randomUUID(), signal?: AbortSignal) {
    const warnings = await validateChangedLinks(model, next, project.root);
    signal?.throwIfAborted();
    const after = serializeModel(next);
    await saveXml(root, before, after, signal);
    agentWork.observe(project.id, next, fingerprint(after));
    db.transaction(() => this.recordCommit(project, root, before, after, model, next, text, id))();
    return this.receipt(model, next, after, id, warnings);
  }
  async canvasCommand(project: AgentProject, input: unknown) {
    const { revision, command } = readCanvasCommand(input);
    return this.edit(project, revision, model => canvasModelEdit(model, command));
  }
  async agentCommand(project: AgentProject, revision: string, input: unknown, signal?: AbortSignal) {
    return this.edit(project, revision, model => agentModelEdit(model, input), signal);
  }
  private async edit(project: AgentProject, revision: string, build: (model: Model) => ReturnType<typeof canvasModelEdit>, signal?: AbortSignal) {
    return this.locked(project, async root => {
      const before = await readXml(root);
      if (fingerprint(before) !== revision) throw new Error("The model changed. Refresh and review the command before applying it.");
      const document = await readModelDocument(root, before);
      if (!document.model) throw new Error("Open a valid model before applying a direct model command.");
      const { next, text } = build(document.model);
      return this.commit(project, root, before, document.model, next, text, undefined, signal);
    });
  }
  async patch(project: AgentProject, revision: string, result: { patch?: ModelPatch; migration?: string }, id: string, signal?: AbortSignal) {
    return this.locked(project, async root => {
      const before = await readXml(root);
      if (fingerprint(before) !== revision) throw new Error("The model changed during this turn. Review the proposed change and ask the agent to reconcile it.");
      const document = await readModelDocument(root, before);
      if (result.patch && !document.model) throw new Error("This document needs migration before incremental model edits.");
      if (result.migration !== undefined && document.model) throw new Error("This model already uses the current schema. Use an incremental patch.");
      if (result.migration !== undefined && document.problem?.kind === "schema-mismatch" && !migrationGuide(document.problem)) throw new Error("No migration instructions exist for this schema. The original document was preserved.");
      const model = document.model || emptyModel("Migration");
      const next = result.migration !== undefined ? migrationModel(result.migration, document.problem!) : applyPatch(model, result.patch);
      return this.commit(project, root, before, model, next, result.migration !== undefined ? "Model migrated" : "Model updated", id, signal);
    });
  }
  /** Durable intent bridges the file/DB boundary. Retry recognizes exact approved bytes; it never overwrites intervening edits. */
  async approveDraft(project: AgentProject, before: string | null, candidate: string, summary: string, id: string, signal?: AbortSignal) {
    return this.locked(project, async root => {
      if (!project.conversationId) throw new Error("A model approval requires its originating task.");
      const sourceRoot = await realpath(project.root), beforeRevision = fingerprint(before), candidateRevision = fingerprint(candidate);
      let approval = this.approval(id);
      if (approval && (approval.projectId !== project.id || approval.taskId !== project.conversationId || approval.root !== root || approval.sourceRoot !== sourceRoot || approval.beforeRevision !== beforeRevision || approval.candidateRevision !== candidateRevision)) throw new Error("This approval does not match the reviewed model delta.");
      if (approval?.receipt) return approval.receipt;
      const saved = await readXml(root);
      if (saved !== before && !(approval && saved === candidate)) throw new Error("The saved model changed. Discard this stale delta and ask the agent to reconcile it.");
      const document = await readModelDocument(root, before);
      const model = document.model || emptyModel("Migration");
      const next = parseModel(candidate);
      const errors = next.issues.filter(issue => issue.severity === "error");
      if (errors.length) throw new Error(errors.map(issue => issue.message).join(" "));
      if (!approval || saved !== candidate) {
        const warnings = await validateChangedLinks(model, next, sourceRoot);
        signal?.throwIfAborted();
        approval = { projectId: project.id, taskId: project.conversationId, root, sourceRoot, beforeRevision, candidateRevision, warnings };
        // The durable draft retains the exact bytes. This record binds the user's approval to them before any write.
        db.run("INSERT OR REPLACE INTO model_approvals VALUES (?, ?)", [id, JSON.stringify(approval)]);
        if (saved !== candidate) await saveXml(root, before, candidate, signal);
      }
      agentWork.observe(project.id, next, candidateRevision);
      const receipt = this.receipt(model, next, candidate, id, approval!.warnings);
      try {
        db.transaction(() => {
          this.recordCommit(project, root, before, candidate, model, next, summary, id);
          db.run("INSERT OR REPLACE INTO model_approvals VALUES (?, ?)", [id, JSON.stringify({ ...approval, receipt })]);
        })();
      } catch (error) {
        throw new Error(`The model was saved, but its approval record could not be completed. Retry finalization; the model will not be written again. ${(error as Error).message}`);
      }
      return receipt;
    });
  }
  async undo(project: AgentProject, expectedChange?: string, signal?: AbortSignal) {
    return this.locked(project, async root => {
      const history = this.stored(project.id), entry = history.undo.at(-1);
      if (!entry) throw new Error("There is no model change to undo.");
      if (project.conversationId && entry.taskId !== project.conversationId) throw new Error("The latest model change belongs to another task or editor. Undo it from its originating task or the project model controls.");
      if (expectedChange && entry.messageId !== expectedChange) throw new Error("A newer model edit exists. Review it before undoing.");
      if (entry.root !== root) throw new Error("The artifact root has changed. Review the model in Git.");
      signal?.throwIfAborted();
      await saveXml(root, entry.after, entry.before, signal);
      history.undo.pop();
      const message = history.changes.find(m => m.id === entry.messageId);
      if (message?.change) message.change.undone = true;
      this.save(project.id, history);
      agentWork.observe(project.id, (await readModelDocument(root, entry.before)).model, fingerprint(entry.before));
    });
  }
}
export const modelEdits = new ModelService();
