import type { AgentDelta, AgentDraft } from "../../shared/agent-work";
import { typeNames, type Annotation, type FlowStep, type ModelItem, type SourceLink } from "../../shared/model";

export interface DraftField { key: string; label: string; before: string; after: string }
type Names = Record<string, string>;
const absent = "—";
const labels: Record<string, string> = { id: "ID", type: "Type", codeLinks: "Source links", parent: "Parent", from: "From", to: "To", steps: "Steps" };
const reference = (id: string | undefined, names: Names) => id ? names[id] && names[id] !== id ? `${names[id]} (${id})` : id : absent;

/** Keep IDs and every locator visible: equal labels can still identify different evidence. */
export function sourceLinkText(link: SourceLink): string {
  return [
    `Kind: ${link.kind === "code" ? "Code" : "Document"}`,
    `ID: ${link.id || absent}`,
    `File: ${link.file}`,
    ...(link.kind === "code" ? [`Symbol: ${link.symbol || absent}`] : [`Heading: ${link.heading || absent}`]),
    `Line: ${link.line ?? absent}`,
    `Role: ${link.role}`,
    `Description: ${link.description}`,
  ].join("\n");
}
function annotationText(annotation: Annotation): string {
  return `Kind: ${annotation.kind}\nEvidence: ${annotation.evidence || absent}\n${annotation.text}`;
}
function stepText(step: FlowStep, names: Names, links: SourceLink[]): string {
  const target = (id: string | undefined) => {
    if (!id) return absent;
    const link = links.find(link => link.id === id);
    if (!link) return id;
    const locator = link.symbol ? `symbol ${link.symbol}` : link.heading ? `heading ${link.heading}` : link.line ? `line ${link.line}` : "whole file";
    return `${id} · ${link.file} · ${locator}`;
  };
  return [`ID: ${step.id}`, `Action: ${step.label}`, `Relationship: ${reference(step.relationship, names)}`,
    `Caller: ${target(step.caller)}`, `Callee: ${target(step.callee)}`, `Call site: ${target(step.callSite)}`].join("\n");
}
function fieldText(field: string, item: ModelItem | undefined, names: Names): string {
  if (!item) return absent;
  switch (field) {
    case "id": return item.id;
    case "type": return typeNames[item.type];
    case "name": return item.name;
    case "description": return item.description;
    case "annotations": return item.annotations.map(annotationText).join("\n\n") || absent;
    case "codeLinks": return item.codeLinks.map(sourceLinkText).join("\n\n") || absent;
    case "parent": return reference("parent" in item ? item.parent : undefined, names);
    case "classification": return item.type === "concept" ? item.classification || absent : absent;
    case "from": return reference(item.type === "relationship" ? item.from : undefined, names);
    case "to": return reference(item.type === "relationship" ? item.to : undefined, names);
    case "steps": return item.type === "flow" ? item.steps.map(step => stepText(step, names, item.codeLinks)).join("\n\n") || absent : absent;
    // New model fields stay visible until they receive a dedicated presentation.
    default: return JSON.stringify((item as unknown as Record<string, unknown>)[field]) ?? absent;
  }
}

/** Each column resolves references against its own model, never the other column's names. */
export function draftReferenceNames(draft: AgentDraft, items: ModelItem[]) {
  const before: Names = Object.fromEntries(items.map(item => [item.id, item.name])), after = { ...before };
  for (const change of draft.changes) {
    if (change.before) before[change.itemId] = change.before.name; else delete before[change.itemId];
    if (change.after) after[change.itemId] = change.after.name; else delete after[change.itemId];
  }
  return draft.referenceNames || { before, after };
}
export function draftFields(change: AgentDelta, draft: AgentDraft, items: ModelItem[]): DraftField[] {
  const item = change.after || change.before;
  if (!item) return [];
  const names = draftReferenceNames(draft, items);
  const fields = !draft.migration && change.kind === "modify" ? change.fields : Object.keys(item);
  return fields.flatMap(key => {
    const before = fieldText(key, change.before, names.before), after = fieldText(key, change.after, names.after);
    if ((key === "annotations" || key === "codeLinks") && before === absent && after === absent) return [];
    return [{ key, label: labels[key] || key.charAt(0).toUpperCase() + key.slice(1), before, after }];
  });
}
