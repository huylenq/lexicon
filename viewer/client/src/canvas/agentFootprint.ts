import { dimensionOf, parentOf, type ModelItem, type Relationship } from "../../../shared/model";
import type { AgentDelta, AgentDraft, AgentWorkState } from "../../../shared/agent-work";
import type { AgentBounds, AgentDeltaSelection, AgentPoint, AgentSurface } from "../AgentWork";
import { getModelDraft } from "../agentDraft";
import type { AgentScope } from "../../../shared/agent-session";

export type AgentConnectionPreview = { from: AgentPoint; to: AgentPoint; path: string };
export type AgentFootprint = {
  itemId: string; name: string; layer: AgentDeltaSelection["layer"]; kind?: "add" | "modify" | "remove";
  bounds: AgentBounds; ghost: boolean; focus?: "inspect" | "edit" | "navigate"; stale?: boolean; reported?: boolean; migration?: boolean; approvalPending?: boolean;
  itemType: ModelItem["type"]; showName?: boolean; absent?: boolean;
  connection?: AgentConnectionPreview;
};
export type FootprintSurface = Pick<AgentSurface, "bounds" | "historicalBounds" | "home" | "homes" | "homeDimension" | "scale">;
export type AgentGhostSlots = ReadonlyMap<string, number>;

/** One workspace's disposable placements. Candidate IDs rotate on every edit;
 * createdAt and the saved baseline identify the lifetime of the pending draft. */
export function createAgentGhostSlots() {
  const tasks = new Map<string, { lifetime: string; slots: Map<string, number> }>();
  return {
    sync(current: { id: string; draft?: AgentDraft }[]): ReadonlyMap<string, AgentGhostSlots> {
      const live = new Set(current.map(task => task.id));
      for (const id of tasks.keys()) if (!live.has(id)) tasks.delete(id);
      for (const { id, draft } of current) {
        if (!draft) { tasks.delete(id); continue; }
        const lifetime = JSON.stringify([draft.createdAt, draft.revision]);
        let task = tasks.get(id);
        if (!task || task.lifetime !== lifetime) {
          task = { lifetime, slots: new Map() }; tasks.set(id, task);
        }
        const additions = draft.changes.filter(change => change.kind === "add" && change.after && !["relationship", "flow"].includes(change.after.type));
        for (const itemId of [...new Set(additions.map(change => change.itemId))].sort()) {
          if (!task.slots.has(itemId)) task.slots.set(itemId, task.slots.size);
        }
        // Removed candidates keep their reserved slots for a later refinement.
        // Releasing one must never repack another pending candidate's position.
      }
      return new Map([...tasks].map(([id, task]) => [id, task.slots]));
    },
  };
}
const center = (bounds: AgentBounds): AgentPoint => ({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });

function boundary(bounds: AgentBounds, toward: AgentPoint): AgentPoint {
  const middle = center(bounds), dx = toward.x - middle.x, dy = toward.y - middle.y;
  const ratio = Math.min(dx ? bounds.width / 2 / Math.abs(dx) : Infinity, dy ? bounds.height / 2 / Math.abs(dy) : Infinity);
  return Number.isFinite(ratio) ? { x: middle.x + dx * ratio, y: middle.y + dy * ratio } : middle;
}

function connection(fromBounds: AgentBounds, toBounds: AgentBounds, self: boolean): AgentConnectionPreview & { bounds: AgentBounds } {
  if (self) {
    const from = { x: fromBounds.x + fromBounds.width, y: fromBounds.y + fromBounds.height * .35 };
    const to = { x: from.x, y: fromBounds.y + fromBounds.height * .75 };
    return { from, to, path: `M ${from.x} ${from.y} C ${from.x + 80} ${from.y - 44}, ${to.x + 80} ${to.y + 44}, ${to.x} ${to.y}`,
      bounds: { x: from.x + 34, y: (from.y + to.y) / 2 - 12, width: 130, height: 24 } };
  }
  const from = boundary(fromBounds, center(toBounds)), to = boundary(toBounds, center(fromBounds));
  // A thin preview line is deliberately simpler than an authored, routed canvas relationship.
  return { from, to, path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    bounds: { x: (from.x + to.x) / 2 - 65, y: (from.y + to.y) / 2 - 12, width: 130, height: 24 } };
}

/** Preview geometry is disposable presentation: it never enters the model or canvas records. */
export function agentFootprints(work: AgentWorkState | undefined, items: ModelItem[], surface: FootprintSurface,
  home: AgentPoint = surface.home, scope: AgentScope = "model", slots?: AgentGhostSlots): AgentFootprint[] {
  if (!work) return [];
  const marks: AgentFootprint[] = [], byId = new Map(items.map(item => [item.id, item]));
  const draft = getModelDraft(work, scope), changes = draft?.changes || [];
  const deltas = new Map(changes.map(delta => [delta.itemId, delta]));
  const snapshot = (delta: AgentDelta): ModelItem | undefined => delta.after || delta.before;
  // Pure callers get deterministic initial placement; the workspace retains slots
  // across revisions so adding an earlier-sorting ID cannot move existing ghosts.
  const ghostIndices = slots || new Map(changes.filter(delta => !surface.bounds[delta.itemId] && snapshot(delta)?.type !== "relationship")
    .map(delta => delta.itemId).sort().map((id, index) => [id, index]));
  const frames = new Map<string, { bounds: AgentBounds; ghost: boolean } | undefined>();
  function frame(item: ModelItem | undefined, id: string, removed: boolean): { bounds: AgentBounds; ghost: boolean } | undefined {
    if (frames.has(id)) return frames.get(id);
    const bounds = surface.bounds[id];
    if (bounds) return { bounds, ghost: false };
    // A real object on another plane (or a Flow without a shape) must not acquire an invented location.
    if (!item || item.type === "flow" || item.type === "relationship" || byId.has(id)) return;
    const dimension = dimensionOf(item), planeHome = dimension && surface.homes?.[dimension];
    if (dimension && !planeHome && surface.homeDimension !== dimension) return;
    const historical = removed && surface.historicalBounds?.[id];
    if (historical) return { bounds: historical, ghost: true };
    const parent = parentOf(item), parentBounds = parent ? surface.bounds[parent] : undefined;
    const origin = parentBounds ? { x: parentBounds.x + parentBounds.width + 24, y: parentBounds.y } : { x: home.x - 226, y: home.y };
    const result = { bounds: { x: origin.x, y: origin.y + 54 + (ghostIndices.get(id) || 0) * 84, width: 202, height: 64 }, ghost: true };
    frames.set(id, result);
    return result;
  }
  function endpoint(id: string) {
    const delta = deltas.get(id), item = delta ? snapshot(delta) : byId.get(id);
    return frame(item, id, delta?.kind === "remove");
  }
  function relationshipFrame(item: Relationship, ghost: boolean) {
    const from = endpoint(item.from), to = endpoint(item.to);
    if (!from || !to) return undefined;
    const { bounds, ...preview } = connection(from.bounds, to.bounds, item.from === item.to);
    return { bounds, ghost, connection: preview };
  }
  function focus(id: string) {
    return { focus: work!.focus?.itemIds.includes(id) ? work!.focus.action : undefined, reported: work!.focus?.reported };
  }
  const context = new Map(work.context.map(item => [item.id, item]));
  for (const id of work.focus?.itemIds || []) if (byId.has(id)) context.set(id, byId.get(id)!);
  for (const [id] of context) {
    const item = byId.get(id);
    if (!item || deltas.has(id)) continue;
    const geometry = item.type === "relationship" ? relationshipFrame(item, false) : frame(item, id, false);
    if (geometry) marks.push({ itemId: id, name: item.name, itemType: item.type, layer: "context", ...geometry, ...focus(id) });
  }
  for (const delta of changes) {
    const item = snapshot(delta);
    if (!item) continue;
    const geometry = item.type === "relationship" ? relationshipFrame(item, !surface.bounds[delta.itemId]) : frame(item, delta.itemId, delta.kind === "remove");
    if (!geometry) continue;
    marks.push({ itemId: delta.itemId, name: item.name, itemType: item.type, layer: "draft", kind: delta.kind,
      ...geometry, ...focus(delta.itemId), showName: geometry.ghost || item.name !== byId.get(delta.itemId)?.name,
      absent: delta.kind === "remove",
      stale: draft?.stale && !draft?.approvalPending, migration: draft?.migration, approvalPending: draft?.approvalPending });
  }
  return marks;
}

/** The focus tether is presentation, never a semantic relationship or a camera command. */
export function agentFocusTether(work: AgentWorkState | undefined, marks: AgentFootprint[], home: AgentPoint) {
  const target = [...work?.focus?.itemIds || []].reverse().map(id => marks.find(mark => mark.itemId === id && mark.focus && !mark.absent)).find(Boolean);
  if (!target) return undefined;
  const from = { x: home.x + 12, y: home.y + 18 }, to = boundary(target.bounds, from);
  if (Math.hypot(from.x - to.x, from.y - to.y) < 40) return undefined;
  return { from, to, path: `M ${from.x} ${from.y} Q ${from.x} ${to.y}, ${to.x} ${to.y}` };
}
