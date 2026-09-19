import { expect, test } from "bun:test";
import { draftFields, sourceLinkText } from "../client/src/agentDraftFields";
import type { AgentDelta, AgentDraft } from "../shared/agent-work";
import type { Flow, ModelItem, SourceLink } from "../shared/model";

const item = (id: string, name = id): ModelItem => ({ id, name, type: "context", description: "", annotations: [], codeLinks: [] });
const draft = (changes: AgentDelta[]): AgentDraft => ({ id: "d", revision: "saved", candidateRevision: "candidate", createdAt: "now", summary: "Change evidence", changes, stale: false });
const source: SourceLink = { kind: "code", id: "evidence", file: "policy.ts", symbol: "accept", line: 10, role: "implementation", description: "Checks acceptance." };

test("every source identity, locator and evidence field changes the review text", () => {
  const alternatives: SourceLink[] = [
    { ...source, id: "replacement" }, { ...source, file: "other.ts" }, { ...source, symbol: "check" },
    { ...source, line: 80 }, { ...source, role: "enforcement" }, { ...source, description: "Rejects invalid inputs." },
    { kind: "document", id: source.id, file: source.file, line: source.line, role: source.role, description: source.description },
  ];
  for (const candidate of alternatives) expect(sourceLinkText(candidate)).not.toBe(sourceLinkText(source));
  const document: SourceLink = { kind: "document", file: "rules.md", heading: "acceptance", role: "specification", description: "Intended behavior." };
  expect(sourceLinkText(document)).toContain("Heading: acceptance");
  expect(sourceLinkText({ ...document, heading: "rejection" })).not.toBe(sourceLinkText(document));
});

test("flow review distinguishes IDs and caller, callee and call-site changes", () => {
  const before: Flow = { ...item("flow"), type: "flow", codeLinks: [source, { ...source, id: "other", symbol: "other" }], steps: [{ id: "step", relationship: "interaction", label: "Accept", caller: "evidence", callee: "evidence", callSite: "evidence" }] };
  for (const field of ["id", "caller", "callee", "callSite"] as const) {
    const after: Flow = { ...before, steps: [{ ...before.steps[0], [field]: "other" }] };
    const change: AgentDelta = { itemId: before.id, kind: "modify", before, after, fields: ["steps"] };
    const [review] = draftFields(change, draft([change]), []);
    expect(review.before).not.toBe(review.after);
    expect(review.after).toContain("ID:");
    expect(review.after).toContain("Caller:"); expect(review.after).toContain("Callee:"); expect(review.after).toContain("Call site:");
  }
});

test("each column uses its own reference names, even with externally renamed saved items", () => {
  const before = { ...item("relation"), type: "relationship" as const, from: "original", to: "target" };
  const after = { ...before, from: "new" };
  const change: AgentDelta = { itemId: before.id, kind: "modify", before, after, fields: ["from", "to"] };
  const candidate = draft([change]);
  candidate.stale = true;
  candidate.referenceNames = { before: { original: "Original Name", target: "Earlier Target" }, after: { new: "New Candidate", target: "Draft Target" } };
  const fields = draftFields(change, candidate, [item("original", "External Rename"), item("target", "External Target")]);
  expect(fields[0].before).toBe("Original Name (original)"); expect(fields[0].after).toBe("New Candidate (new)");
  expect(fields[1].before).toBe("Earlier Target (target)"); expect(fields[1].after).toBe("Draft Target (target)");
});

test("plain names and descriptions are never mistaken for item references; added and removed IDs remain reviewable", () => {
  const before = { ...item("order"), description: "policy" }, after = { ...before, description: "Policy" };
  const change: AgentDelta = { itemId: before.id, kind: "modify", before, after, fields: ["description"] };
  const [field] = draftFields(change, draft([change]), [item("policy", "Policy")]);
  expect(field.before).toBe("policy"); expect(field.after).toBe("Policy");
  const addition: AgentDelta = { itemId: after.id, kind: "add", after, fields: [] };
  expect(draftFields(addition, draft([addition]), []).find(field => field.key === "id")?.after).toBe("order");
  expect(draftFields(addition, draft([addition]), []).find(field => field.key === "type")?.after).toBe("Context");
});
