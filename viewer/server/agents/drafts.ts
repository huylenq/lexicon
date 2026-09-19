import { realpath } from "node:fs/promises";
import { db } from "../db";
import { agentModelEdit } from "../agent/edit";
import { emptyModel, readModelDocument, serializeModel } from "../model";
import { applyPatch, fingerprint, migrationModel, readXml, validateChangedLinks } from "../model-edit";
import { migrationGuide } from "../model-migrations";
import { modelEdits, type AgentProject, type ModelService } from "../model-service";
import type { AgentDraft } from "../../shared/agent-work";
import type { Model } from "../../shared/model";
import { agentWork } from "./work";
import { modelDeltas } from "../model-delta";
import { readSource } from "../source";
import * as log from "../log";

interface StoredDraft {
  id: string; projectId: string; taskId: string; root: string; sourceRoot: string;
  before: string | null; candidate: string; summary: string; createdAt: string;
  migration: boolean; base: Model; next: Model;
}
db.exec("CREATE TABLE IF NOT EXISTS agent_model_drafts (task_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, state TEXT NOT NULL)");
if (!db.query<{ name: string }, []>("PRAGMA table_info(agent_model_drafts)").all().some(column => column.name === "state_id")) {
  db.exec("ALTER TABLE agent_model_drafts ADD COLUMN state_id TEXT NOT NULL DEFAULT ''");
  db.exec("UPDATE agent_model_drafts SET state_id = lower(hex(randomblob(16)))");
}
db.exec("CREATE INDEX IF NOT EXISTS agent_model_draft_identity ON agent_model_drafts (project_id, task_id, state_id)");

/** A private candidate per conversation. No tool can approve it; only viewer actions can save. */
export class AgentDrafts {
  private locks = new Set<string>();
  private cache = new Map<string, { id: string; characters: number; draft: StoredDraft }>();
  private cacheCharacters = 0;
  private presentations = new WeakMap<StoredDraft, { base: AgentDraft; variants: Map<string, AgentDraft> }>();
  private key(project: AgentProject) {
    if (!project.conversationId) throw new Error("Model deltas require an agent conversation.");
    return project.conversationId;
  }
  private async locked<T>(project: AgentProject, action: () => Promise<T>) {
    const key = this.key(project);
    if (this.locks.has(key)) throw new Error("Wait for the current model delta action to finish.");
    this.locks.add(key);
    try { return await action(); } finally { this.locks.delete(key); }
  }
  private read(projectId: string, taskId: string): StoredDraft | undefined {
    // Candidate identity changes on every stage. Check it without copying the
    // potentially multi-megabyte XML/model payload out of SQLite on each tick.
    const identity = db.query<{ state_id: string }, [string, string]>("SELECT state_id FROM agent_model_drafts INDEXED BY agent_model_draft_identity WHERE project_id = ? AND task_id = ?").get(projectId, taskId);
    const key = JSON.stringify([projectId, taskId]), cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cacheCharacters -= cached.characters; }
    if (!identity) return;
    const row = cached?.id === identity.state_id ? undefined : db.query<{ state: string }, [string, string]>("SELECT state FROM agent_model_drafts WHERE project_id = ? AND task_id = ?").get(projectId, taskId);
    const entry = cached?.id === identity.state_id ? cached : row ? { id: identity.state_id, characters: row.state.length, draft: JSON.parse(row.state) as StoredDraft } : undefined;
    if (!entry) return;
    if (entry.characters <= 16_000_000) {
      this.cache.set(key, entry); this.cacheCharacters += entry.characters;
      while (this.cache.size > 8 || this.cacheCharacters > 16_000_000) {
        const oldest = this.cache.keys().next().value!;
        this.cacheCharacters -= this.cache.get(oldest)!.characters; this.cache.delete(oldest);
      }
    }
    return entry.draft;
  }
  state(projectId: string, taskId: string, savedRevision?: string): AgentDraft | undefined {
    const draft = this.read(projectId, taskId);
    if (!draft) return;
    let cached = this.presentations.get(draft);
    if (!cached) { cached = { base: this.present(draft), variants: new Map() }; this.presentations.set(draft, cached); }
    const { candidateRevision, revision } = cached.base;
    const approvalPending = savedRevision === candidateRevision && modelEdits.hasApproval(projectId, taskId, draft.id, candidateRevision);
    const stale = !approvalPending && savedRevision !== undefined && savedRevision !== revision, key = `${stale}:${approvalPending}`;
    const existing = cached.variants.get(key);
    if (existing) return existing;
    const state = { ...cached.base, stale, ...(approvalPending ? { approvalPending: true } : {}) };
    cached.variants.set(key, state);
    return state;
  }
  private present(draft: StoredDraft): AgentDraft {
    const before = { name: draft.base.name, description: draft.base.description }, after = { name: draft.next.name, description: draft.next.description };
    const changes = modelDeltas(draft.base.items, draft.next.items);
    const references = (side: "before" | "after", model: Model) => {
      const ids = new Set(changes.flatMap(change => {
        const item = change[side];
        if (!item) return [];
        return [...("parent" in item ? [item.parent] : []), ...("from" in item ? [item.from, item.to] : []), ...(item.type === "flow" ? item.steps.map(step => step.relationship) : [])];
      }));
      return Object.fromEntries(model.items.filter(item => ids.has(item.id)).map(item => [item.id, item.name]));
    };
    return { id: draft.id, summary: draft.summary, createdAt: draft.createdAt, revision: fingerprint(draft.before), candidateRevision: fingerprint(draft.candidate), changes,
      stale: false, referenceNames: { before: references("before", draft.base), after: references("after", draft.next) },
      ...(JSON.stringify(before) !== JSON.stringify(after) ? { project: { before, after } } : {}), ...(draft.migration ? { migration: true } : {}) };
  }
  candidateRevision(project: AgentProject, savedRevision: string) {
    const draft = project.conversationId && this.read(project.id, project.conversationId);
    return draft ? fingerprint(draft.candidate) : savedRevision;
  }
  async source(project: AgentProject, draftId: string, itemId: string, side: "before" | "after", linkIndex: number) {
    const taskId = this.key(project), draft = this.read(project.id, taskId);
    if (!draft || draft.id !== draftId) throw new Error("This model delta changed or is no longer available. Review the current overlay.");
    if (draft.root !== await realpath(project.artifactRoot) || draft.sourceRoot !== await realpath(project.root)) throw new Error("This delta belongs to a different checkout or artifact root.");
    const model = side === "before" ? draft.base : draft.next;
    const link = model.items.find(item => item.id === itemId)?.codeLinks[linkIndex];
    if (!link || !Number.isInteger(linkIndex) || linkIndex < 0) throw new Error("This source link is unavailable in the requested model delta.");
    const excerpt = await readSource(draft.sourceRoot, link);
    if (this.read(project.id, taskId)?.id !== draftId) throw new Error("This model delta changed while reading its source. Review the current overlay.");
    return { link, excerpt };
  }
  async snapshot(project: AgentProject) {
    await this.recover(project, modelEdits).catch(() => {});
    const saved = await readXml(project.artifactRoot), draft = project.conversationId && this.read(project.id, project.conversationId);
    const xml = draft ? draft.candidate : saved;
    const approvalPending = !!draft && saved === draft.candidate && modelEdits.hasApproval(project.id, draft.taskId, draft.id, fingerprint(draft.candidate));
    return { ...await readModelDocument(project.artifactRoot, xml), revision: fingerprint(xml), savedRevision: fingerprint(saved),
      ...(draft ? { draftId: draft.id, unsaved: !approvalPending, stale: !approvalPending && saved !== draft.before, ...(approvalPending ? { approvalPending: true } : {}) } : {}), sourceRoot: project.root, artifactRoot: project.artifactRoot };
  }
  async stage(project: AgentProject, revision: string, operation: { edit?: unknown; patch?: unknown; migration?: string }, signal?: AbortSignal) {
    return this.locked(project, async () => {
      if (project.example) throw new Error("The built-in example is read-only.");
      const root = await realpath(project.artifactRoot), sourceRoot = await realpath(project.root), taskId = this.key(project);
      const saved = await readXml(root), old = this.read(project.id, taskId);
      if (old && modelEdits.hasApproval(project.id, taskId, old.id, fingerprint(old.candidate))) throw new Error("Finish the pending approval or discard the unsaved draft before making further edits.");
      if (old && (old.root !== root || old.sourceRoot !== sourceRoot)) throw new Error("This delta belongs to a different checkout or artifact root.");
      if (old && saved !== old.before) {
        log.warn("model", { msg: "stale", projectId: project.id, taskId });
        throw new Error("The saved model changed. Discard this stale delta and ask the agent to reconcile it.");
      }
      const xml = old ? old.candidate : saved;
      if (fingerprint(xml) !== revision) throw new Error("The model delta changed. Inspect it before editing again.");
      const document = await readModelDocument(root, xml);
      if (operation.migration !== undefined && document.model) throw new Error("This model already uses the current schema. Use an incremental patch.");
      if (operation.migration !== undefined && document.problem?.kind === "schema-mismatch" && !migrationGuide(document.problem)) throw new Error("No migration instructions exist for this schema. The original document was preserved.");
      if (operation.migration === undefined && !document.model) throw new Error("This document needs migration before incremental model edits.");
      const current = document.model || emptyModel("Migration");
      const edit = operation.edit === undefined ? undefined : agentModelEdit(current, operation.edit);
      const next = edit?.next || (operation.migration !== undefined ? migrationModel(operation.migration, document.problem!) : applyPatch(current, operation.patch));
      const warnings = await validateChangedLinks(current, next, sourceRoot);
      signal?.throwIfAborted();
      if (await readXml(root) !== saved) {
        log.warn("model", { msg: "stale", projectId: project.id, taskId });
        throw new Error("The saved model changed while validating the delta. No changes were saved.");
      }
      const draft: StoredDraft = { id: crypto.randomUUID(), projectId: project.id, taskId, root, sourceRoot, before: old ? old.before : saved, candidate: serializeModel(next), base: old?.base || current, next,
        summary: edit?.text || (operation.migration !== undefined ? "Model migration" : "Model changes"), createdAt: old?.createdAt || new Date().toISOString(), migration: !!old?.migration || operation.migration !== undefined };
      const changes = modelDeltas(draft.base.items, next.items);
      const hasChanges = draft.migration || changes.length > 0 || draft.base.name !== next.name || draft.base.description !== next.description;
      if (hasChanges) db.run("INSERT OR REPLACE INTO agent_model_drafts (task_id, project_id, state, state_id) VALUES (?, ?, ?, ?)", [taskId, project.id, JSON.stringify(draft), draft.id]);
      else db.run("DELETE FROM agent_model_drafts WHERE task_id = ? AND project_id = ?", [taskId, project.id]);
      agentWork.focus(project, taskId, modelDeltas(current.items, next.items).map(change => change.itemId), "edit");
      const candidateRevision = hasChanges ? fingerprint(draft.candidate) : fingerprint(saved);
      log.info("model", { msg: hasChanges ? "staged" : "cleared", projectId: project.id, taskId, draftId: hasChanges ? draft.id : undefined, revision: candidateRevision, warnings: warnings.length });
      return { status: "draft" as const, draftId: hasChanges ? draft.id : null, revision: candidateRevision, savedRevision: fingerprint(saved), affectedIds: changes.map(change => change.itemId), warnings,
        message: hasChanges ? "Model delta staged for user review. model.xml has not changed." : "The staged delta is empty. model.xml has not changed." };
    });
  }
  async apply(project: AgentProject, draftId: unknown, writer: ModelService) {
    return this.locked(project, async () => {
      const taskId = this.key(project), draft = this.read(project.id, taskId);
      if (!draft && typeof draftId === "string") {
        const receipt = await writer.approvalReceipt(project, draftId);
        if (receipt) return { ...receipt, status: "saved" as const };
      }
      if (!draft || draft.id !== draftId) throw new Error("This model delta changed or is no longer available. Review the current overlay before approving.");
      if (draft.root !== await realpath(project.artifactRoot) || draft.sourceRoot !== await realpath(project.root)) throw new Error("This delta belongs to a different checkout or artifact root.");
      const receipt = await writer.approveDraft(project, draft.before, draft.candidate, "Approved model delta", draft.id);
      try { db.run("DELETE FROM agent_model_drafts WHERE task_id = ? AND project_id = ?", [taskId, project.id]); }
      catch { throw new Error("The model was saved and approved, but its draft could not be cleared. Retry finalization; the model will not be written again."); }
      return { ...receipt, status: "saved" as const };
    });
  }
  async discard(project: AgentProject, draftId: unknown) {
    return this.locked(project, async () => {
      const taskId = this.key(project), draft = this.read(project.id, taskId);
      if (!draft || draft.id !== draftId) throw new Error("This model delta changed or is no longer available. Review the current overlay before discarding.");
      if (modelEdits.hasApproval(project.id, taskId, draft.id, fingerprint(draft.candidate)) && await readXml(project.artifactRoot) === draft.candidate) throw new Error("This model was already saved. Retry finalization instead of discarding its approval.");
      db.run("DELETE FROM agent_model_drafts WHERE task_id = ? AND project_id = ?", [taskId, project.id]);
      log.info("model", { msg: "discarded", projectId: project.id, taskId, draftId: draft.id });
    });
  }
  /** Reads may finish already-saved approvals, but never write an unsaved candidate automatically. */
  async recover(project: AgentProject, writer: ModelService) {
    const draft = project.conversationId && this.read(project.id, project.conversationId);
    if (!draft || !writer.hasApproval(project.id, draft.taskId, draft.id, fingerprint(draft.candidate))) return;
    if (!await writer.approvalReceipt(project, draft.id) && await readXml(project.artifactRoot) !== draft.candidate) return;
    await this.apply(project, draft.id, writer);
  }
  forget(taskId: string) { db.run("DELETE FROM agent_model_drafts WHERE task_id = ?", [taskId]); }
}
export const agentDrafts = new AgentDrafts();
