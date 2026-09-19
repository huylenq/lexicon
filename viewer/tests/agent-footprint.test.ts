import { expect, test } from "bun:test";
import { agentFocusTether, agentFootprints, createAgentGhostSlots, type FootprintSurface } from "../client/src/canvas/agentFootprint";
import { getModelDraft } from "../client/src/agentDraft";
import { emptyAgentWork, type AgentWorkState } from "../shared/agent-work";
import type { ModelItem, Relationship } from "../shared/model";

const item = (id: string, type: ModelItem["type"] = "context") => ({ id, type, name: id, description: "", annotations: [], codeLinks: [] }) as ModelItem;
const relationship = (id: string, from: string, to: string): Relationship => ({ ...item(id), type: "relationship", from, to });
type Draft = NonNullable<AgentWorkState["draft"]>;
const draft = (changes: Draft["changes"], extra: Partial<Draft> = {}): Draft => ({ id: "d", revision: "saved", candidateRevision: "candidate", createdAt: "now", summary: "Reconsider boundary", stale: false, changes, ...extra });
const surface: FootprintSurface = {
  bounds: { domain: { x: 100, y: 200, width: 500, height: 300 }, architecture: { x: 900, y: 100, width: 160, height: 80 } },
  historicalBounds: { deleted: { x: 300, y: 240, width: 120, height: 80 } },
  home: { x: -180, y: 200 }, homes: { domain: { x: -180, y: 200 }, architecture: { x: 620, y: 100 } }, homeDimension: "domain", scale: 1,
};

test("one working perspective spans dimensions without changing shared objects or canvas records", () => {
  const items = [item("domain"), item("architecture", "system")], work = emptyAgentWork();
  work.context = items;
  work.focus = { itemIds: ["architecture"], action: "inspect", at: "now" };
  const before = JSON.stringify({ items, work, surface });
  expect(agentFootprints(work, items, surface).map(mark => [mark.itemId, mark.focus])).toEqual([["domain", undefined], ["architecture", "inspect"]]);
  expect(JSON.stringify({ items, work, surface })).toBe(before);
});

test("only a model-only agent receives the current draft overlay", () => {
  const work = emptyAgentWork(), domain = item("domain");
  work.context = [domain];
  work.draft = draft([{ itemId: "domain", kind: "modify", before: domain, after: { ...domain, name: "Draft name" }, fields: ["name"] }]);
  expect(getModelDraft(work)).toBe(work.draft);
  expect(agentFootprints(work, [domain], surface).map(mark => [mark.layer, mark.name, mark.showName])).toEqual([["draft", "Draft name", true]]);
  expect(getModelDraft(work, "code")).toBeUndefined();
  expect(agentFootprints(work, [domain], surface, undefined, "code").map(mark => mark.layer)).toEqual(["context"]);
  delete work.draft;
  expect(agentFootprints(work, [domain], surface).map(mark => mark.layer)).toEqual(["context"]);
});

test("stale drafts preserve their baseline while showing a refresh warning", () => {
  const work = emptyAgentWork(), domain = item("domain");
  work.draft = draft([{ itemId: "domain", kind: "modify", before: domain, after: { ...domain, name: "Draft name" }, fields: ["name"] }], { stale: true });
  expect(agentFootprints(work, [{ ...domain, name: "External name" }], surface)).toMatchObject([{ layer: "draft", name: "Draft name", stale: true, bounds: surface.bounds.domain }]);
  expect(work.draft.changes[0].before?.name).toBe("domain");
});

test("draft removals outline the saved object without moving its authored location", () => {
  const work = emptyAgentWork(), domain = item("domain");
  work.draft = draft([{ itemId: domain.id, kind: "remove", before: domain, fields: [] }]);
  expect(agentFootprints(work, [domain], surface)).toMatchObject([{ layer: "draft", kind: "remove", ghost: false, absent: true, bounds: surface.bounds.domain }]);
});

test("temporary relationships use explicit endpoints including a proposed ghost, independent of delta order", () => {
  const work = emptyAgentWork(), domain = item("domain"), addition = { ...item("new", "concept"), parent: "domain" } as ModelItem, link = relationship("validates", "new", "domain");
  work.draft = draft([{ itemId: link.id, kind: "add", after: link, fields: [] }, { itemId: addition.id, kind: "add", after: addition, fields: [] }]);
  const before = JSON.stringify(work), marks = agentFootprints(work, [domain], surface), node = marks.find(mark => mark.itemId === "new")!, edge = marks.find(mark => mark.itemId === link.id)!;
  expect(node).toMatchObject({ ghost: true, layer: "draft", itemType: "concept" });
  expect(node.bounds.x).toBeGreaterThan(surface.bounds.domain.x + surface.bounds.domain.width);
  expect(edge).toMatchObject({ ghost: true, itemType: "relationship" });
  expect(edge.connection!.from.x).toBe(node.bounds.x);
  expect(edge.connection!.to.x).toBe(surface.bounds.domain.x + surface.bounds.domain.width);
  expect(edge.connection!.path).toContain(" L ");
  expect(JSON.stringify(work)).toBe(before);
  work.draft.changes.reverse();
  const reordered = agentFootprints(work, [domain], surface);
  expect(reordered.find(mark => mark.itemId === "new")!.bounds).toEqual(node.bounds);
  expect(reordered.find(mark => mark.itemId === link.id)!.connection).toEqual(edge.connection);
});

test("relationship previews use draft endpoint IDs, including self connections", () => {
  const work = emptyAgentWork(), before = relationship("edge", "domain", "architecture"), after = relationship("edge", "domain", "domain");
  work.draft = draft([{ itemId: "edge", kind: "modify", before, after, fields: ["to"] }]);
  const mark = agentFootprints(work, [item("domain"), item("architecture", "system"), before], surface)[0];
  expect(mark.connection!.path).toContain(" C ");
  expect(mark.connection!.from.x).toBe(surface.bounds.domain.x + surface.bounds.domain.width);
  expect(mark.connection!.to.x).toBe(mark.connection!.from.x);
});

test("unavailable endpoint planes, existing off-plane objects and Flows get no invented locations", () => {
  const work = emptyAgentWork(), elsewhere = item("elsewhere", "system"), flow = { ...item("flow", "flow"), steps: [] } as ModelItem;
  const domainOnly = { ...surface, homes: { domain: surface.home } };
  work.context = [elsewhere, flow];
  work.draft = draft([
    { itemId: "elsewhere", kind: "modify", before: elsewhere, after: { ...elsewhere, name: "New name" }, fields: ["name"] },
    { itemId: "new-system", kind: "add", after: item("new-system", "system"), fields: [] },
    { itemId: "link", kind: "add", after: relationship("link", "domain", "elsewhere"), fields: [] },
    { itemId: "flow", kind: "add", after: flow, fields: [] },
  ]);
  expect(agentFootprints(work, [item("domain"), elsewhere], domainOnly)).toEqual([]);
});

test("unanchored ghosts follow the agent's presentation home without resurrecting deleted context", () => {
  const work = emptyAgentWork();
  work.context = [item("gone")];
  work.draft = draft([{ itemId: "new", kind: "add", after: item("new"), fields: [] }]);
  const first = agentFootprints(work, [], surface, { x: 1000, y: 700 }), moved = agentFootprints(work, [], surface, { x: 1300, y: 900 });
  expect(first).toHaveLength(1);
  expect(moved[0].bounds.x - first[0].bounds.x).toBe(300);
  expect(moved[0].bounds.y - first[0].bounds.y).toBe(200);
});

test("project-only and migration drafts do not invent item ghosts", () => {
  const work = emptyAgentWork();
  work.draft = draft([], { migration: true, project: { before: { name: "Old", description: "" }, after: { name: "New", description: "" } } });
  expect(getModelDraft(work)?.migration).toBe(true);
  expect(agentFootprints(work, [], surface)).toEqual([]);
});

test("focus tether targets the latest visible focus, never an unavailable item's invented location", () => {
  const work = emptyAgentWork(), items = [item("domain"), item("architecture", "system"), item("elsewhere", "system")];
  work.context = items;
  work.focus = { itemIds: ["domain", "architecture", "elsewhere"], action: "inspect", at: "now", reported: true };
  const tether = agentFocusTether(work, agentFootprints(work, items, surface), surface.home)!;
  expect(tether.from).toEqual({ x: surface.home.x + 12, y: surface.home.y + 18 });
  expect(tether.to.x).toBe(surface.bounds.architecture.x);
  work.focus.itemIds = ["elsewhere"];
  expect(agentFocusTether(work, agentFootprints(work, items, surface), surface.home)).toBeUndefined();
});

test("a pending draft retains each ghost's slot when revisions add, reorder, remove, and restore other candidates", () => {
  const slots = createAgentGhostSlots(), work = emptyAgentWork(), domain = item("domain");
  const addition = (id: string): Draft["changes"][number] => ({ itemId: id, kind: "add", after: { ...item(id, "concept"), parent: "domain" } as ModelItem, fields: [] });
  const render = () => agentFootprints(work, [domain], surface, undefined, "model", slots.sync([{ id: "agent-a", draft: work.draft }]).get("agent-a"));
  work.draft = draft([addition("z")], { id: "candidate-1" });
  const original = render()[0].bounds;
  work.draft = draft([addition("a"), addition("z")], { id: "candidate-2", candidateRevision: "revision-2" });
  const second = render(), a = second.find(mark => mark.itemId === "a")!.bounds;
  expect(second.find(mark => mark.itemId === "z")!.bounds).toEqual(original);
  expect(a.y).toBeGreaterThan(original.y);
  work.draft = draft([addition("m"), addition("z")], { id: "candidate-3" });
  const third = render();
  expect(third.find(mark => mark.itemId === "z")!.bounds).toEqual(original);
  expect(third.find(mark => mark.itemId === "m")!.bounds.y).toBeGreaterThan(a.y);
  work.draft.changes = [addition("z"), addition("m"), addition("a")];
  const before = JSON.stringify({ work, surface, domain });
  const restored = render();
  expect(restored.find(mark => mark.itemId === "a")!.bounds).toEqual(a);
  expect(restored.find(mark => mark.itemId === "z")!.bounds).toEqual(original);
  expect(JSON.stringify({ work, surface, domain })).toBe(before);
});

test("ghost slots are task-owned and released when a draft or task ends, including a missed empty snapshot", () => {
  const slots = createAgentGhostSlots();
  const addition = (id: string): Draft["changes"][number] => ({ itemId: id, kind: "add", after: item(id), fields: [] });
  const first = draft([addition("z")]);
  slots.sync([{ id: "agent-a", draft: first }]);
  const refined = draft([addition("a"), addition("z")], { id: "new-candidate-id" });
  let current = slots.sync([{ id: "agent-a", draft: refined }, { id: "agent-b", draft: refined }]);
  expect([...current.get("agent-a")!]).toEqual([["z", 0], ["a", 1]]);
  expect([...current.get("agent-b")!]).toEqual([["a", 0], ["z", 1]]);
  current = slots.sync([{ id: "agent-a" }, { id: "agent-b", draft: refined }]);
  expect(current.has("agent-a")).toBe(false);
  current = slots.sync([{ id: "agent-a", draft: refined }]);
  expect(current.has("agent-b")).toBe(false);
  expect([...current.get("agent-a")!]).toEqual([["a", 0], ["z", 1]]);
  // The provider may replace a discarded draft between viewer polls. Its new
  // creation time still starts a fresh placement lifetime, even with the same base.
  current = slots.sync([{ id: "agent-a", draft: draft([addition("z")], { createdAt: "later" }) }]);
  expect([...current.get("agent-a")!]).toEqual([["z", 0]]);
  expect(slots.sync([]).size).toBe(0);
});

test("relationship previews keep the same endpoints as their retained candidate slots", () => {
  const slots = createAgentGhostSlots(), work = emptyAgentWork(), domain = item("domain");
  const z = item("z"), a = item("a"), edge = relationship("edge", "z", "domain");
  work.draft = draft([{ itemId: "z", kind: "add", after: z, fields: [] }, { itemId: "edge", kind: "add", after: edge, fields: [] }]);
  const render = () => agentFootprints(work, [domain], surface, undefined, "model", slots.sync([{ id: "agent-a", draft: work.draft }]).get("agent-a"));
  const before = render().find(mark => mark.itemId === "edge")!.connection;
  work.draft = { ...work.draft, id: "refinement", changes: [{ itemId: "a", kind: "add", after: a, fields: [] }, ...work.draft.changes] };
  expect(render().find(mark => mark.itemId === "edge")!.connection).toEqual(before);
  expect(slots.sync([{ id: "agent-a", draft: work.draft }]).get("agent-a")!.has("edge")).toBe(false);
});
