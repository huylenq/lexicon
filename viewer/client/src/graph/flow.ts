import { sourceTargetId, type CodeLink, type Flow, type ModelElement } from "../../../shared/model";
import { projectFlow, type GraphIndex } from "./model";

export interface FlowCodeTarget { link: CodeLink; index: number }
export interface FlowLifeline { id: string; actor: ModelElement; code?: FlowCodeTarget }

/** A code target is scoped to a participant: the same implementation may serve several responsibilities. */
export function projectSequence(index: GraphIndex, flow: Flow, showCode: boolean) {
  const { actors, interactions } = projectFlow(index, flow);
  const resolve = (id?: string): FlowCodeTarget | undefined => {
    if (!id) return;
    const index = flow.codeLinks.findIndex(link => link.id === id);
    const link = flow.codeLinks[index];
    return link?.kind === "code" && (link.symbol?.trim() || link.line) ? { link, index } : undefined;
  };
  const lanes = new Map<string, FlowLifeline>();
  const lane = (actor: ModelElement, code?: FlowCodeTarget) => {
    const id = JSON.stringify([actor.id, code ? sourceTargetId(code.link) : null]);
    if (!lanes.has(id)) lanes.set(id, { id, actor, ...(code ? { code } : {}) });
    return id;
  };
  const rows = interactions.map(interaction => {
    const { step, from, to } = interaction;
    const missingCode = (["caller", "callee", "callSite"] as const)
      .filter(field => step[field] !== undefined && !resolve(step[field]));
    return { ...interaction,
      fromLane: from ? lane(from, showCode ? resolve(step.caller) : undefined) : undefined,
      toLane: to ? lane(to, showCode ? resolve(step.callee) : undefined) : undefined,
      callSite: resolve(step.callSite), missingCode,
    };
  });
  const groups = actors.map(actor => ({ actor, lanes: [...lanes.values()].filter(lane => lane.actor.id === actor.id) }));
  return { groups, lanes: groups.flatMap(group => group.lanes), rows };
}
