import type { CSSProperties } from "react";
import type { AgentDelta, AgentDraft } from "../../shared/agent-work";
import type { ModelItem, SourceLink } from "../../shared/model";
import { sourceLabel } from "../../shared/source";
import { draftFields, type DraftField } from "./agentDraftFields";
import "./styles/agent-canvas-review.css";

function Values({ fields, stale, draftOnly, approvalPending }: { fields: DraftField[]; stale?: boolean; draftOnly?: boolean; approvalPending?: boolean }) {
  return <div className="agent-review-fields">{fields.map(field => {
    const values = [...(draftOnly ? [] : [{ label: approvalPending ? "Before approval" : stale ? "Saved when drafted" : "Saved", value: field.before }]), { label: approvalPending ? "Saved" : "Draft", value: field.after }];
    return <section className="agent-review-field" key={field.key}><h4>{field.label}</h4>
      <div className="agent-review-values" style={{ "--review-columns": values.length } as CSSProperties}>{values.map(({ label, value }) => <div key={label}><small>{label}</small><p>{value}</p></div>)}</div>
    </section>;
  })}</div>;
}
export function DraftFields({ change, draft, items, onOpenSource }: { change: AgentDelta; draft: AgentDraft; items: ModelItem[]; onOpenSource?: (link: SourceLink, side: "before" | "after", index: number) => void }) {
  return <><p className="agent-review-caption">{draft.approvalPending ? "The model is saved; approval recording needs to finish." : draft.migration ? "Draft model item · original schema unavailable for comparison" : `Unsaved ${change.kind === "add" ? "addition" : change.kind === "remove" ? "removal" : "change"}`}{!draft.approvalPending && " · approval saves the whole draft."}</p>
    {draft.stale && !draft.approvalPending && <p className="agent-review-notice">The saved model changed. Saved values below are this draft’s earlier baseline. Discard this draft, then ask the agent to reconcile the changes with the current model.</p>}
    <Values fields={draftFields(change, draft, items)} stale={draft.stale} draftOnly={draft.migration} approvalPending={draft.approvalPending} />
    {onOpenSource && (change.before?.codeLinks.length || change.after?.codeLinks.length) ? <details className="agent-review-source-links"><summary>Source links</summary>
      {(["before", "after"] as const).map(side => {
        const links = change[side]?.codeLinks || [];
        return !!links.length && <section key={side} aria-label={side === "before" ? "Saved source links" : "Draft source links"}><h4>{side === "before" ? draft.stale ? "Saved when drafted" : "Saved" : draft.approvalPending ? "Saved by approval" : "Draft"}</h4>{links.map((link, index) => <button key={index} className="quiet" onClick={() => onOpenSource(link, side, index)}>{link.file}<small>{sourceLabel(link)} · {link.role}</small></button>)}</section>;
      })}
    </details> : null}
  </>;
}
export function DraftMetadata({ draft }: { draft: AgentDraft }) {
  const fields: DraftField[] = draft.project ? (["name", "description"] as const).filter(key => draft.migration || draft.project!.before[key] !== draft.project!.after[key])
    .map(key => ({ key, label: key === "name" ? "Name" : "Description", before: draft.project!.before[key], after: draft.project!.after[key] })) : [];
  return <>{draft.migration && <p className="agent-review-notice">{draft.approvalPending ? "The model schema migration is saved; recording its approval must finish." : "Includes a model schema migration. Approval replaces the model document with the reviewed draft."} Original project details are not available in this comparison.</p>}
    {!!fields.length && <section aria-label="Project changes"><h4>Project details</h4><Values fields={fields} stale={draft.stale} draftOnly={draft.migration} approvalPending={draft.approvalPending} /></section>}
  </>;
}
export function DraftActions({ draft, busy, running, onApprove, onDiscard }: { draft: AgentDraft; busy: boolean; running?: boolean; onApprove: (id: string) => void; onDiscard: (id: string) => void }) {
  return <><div className="agent-draft-actions"><button className="agent-draft-approve" disabled={busy || running || draft.stale && !draft.approvalPending} onClick={() => onApprove(draft.id)}>{draft.approvalPending ? "Retry finalization" : "Approve changes"}</button><button className="quiet" disabled={busy || running || draft.approvalPending} onClick={() => onDiscard(draft.id)}>Discard draft</button></div>
    {draft.approvalPending && <p className="agent-review-notice" role="status">The model is saved. Recording the approval did not finish. Retry to finish recording it; discarding cannot undo the saved model.</p>}
    {running && <p className="agent-review-caption">Approve or discard after the agent finishes or stops.</p>}
    {draft.stale && !draft.approvalPending && <p className="agent-review-notice" role="status">The saved model changed. Discard this draft, then ask the agent to reconcile the changes with the current model.</p>}
  </>;
}
