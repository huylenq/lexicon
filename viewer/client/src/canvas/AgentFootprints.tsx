import { useAgentSurface } from "../AgentSurface";
import { useEffect, useId, useMemo } from "react";
import { useAgentWork, type AgentPoint, type AgentSurface, type AgentTask } from "../AgentWork";
import { typeNames } from "../../../shared/model";
import { agentFocusTether, agentFootprints, type AgentFootprint, type AgentGhostSlots } from "./agentFootprint";
import "../styles/agent-footprints.css";

function label(mark: AgentFootprint) {
  if (mark.layer === "context") return mark.focus ? mark.reported ? "Agent focus" : ({ inspect: "Inspected", edit: "Model operation", navigate: "Viewed" })[mark.focus] : "Context";
  if (mark.approvalPending) return "Saved · finish approval";
  if (mark.migration) return "Migration draft";
  return `Draft ${mark.kind === "add" ? "addition" : mark.kind === "remove" ? "removal" : "change"}`;
}

/** A selected agent exposes its perspective without changing the user's selection or camera. */
export function AgentFootprints({ task, surface, point, ghostSlots }: { task?: AgentTask; surface: AgentSurface; point?: AgentPoint; ghostSlots?: AgentGhostSlots }) {
  const work = useAgentWork();
  const arrowId = useId().replace(/:/g, "");
  const marks = useMemo(() => agentFootprints(task?.state?.work, work?.items || [], surface, point, task?.state?.scope || task?.agent.scope, ghostSlots),
    [task?.state?.work, work?.items, surface, point?.x, point?.y, task?.state?.scope, task?.agent.scope, ghostSlots]);
  const tether = agentFocusTether(task?.state?.work, marks, point || surface.home);
  const setLocations = useAgentSurface()?.setDeltaLocations;
  useEffect(() => {
    if (!task) return;
    setLocations?.(task.agent.id, Object.fromEntries(marks.map(mark => [`${mark.layer}:${mark.itemId}`, { x: mark.bounds.x, y: mark.bounds.y }])));
    return () => setLocations?.(task.agent.id, {});
  }, [task?.agent.id, marks, setLocations]);
  if (!task?.state?.work || !work) return null;
  const name = task.agent.name;
  return <div className="agent-footprints" data-perspective="draft" aria-label={`${name} working footprint`}>
    <svg className="agent-footprint-connections" aria-hidden="true">
      <defs><marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="context-stroke" /></marker></defs>
      {tether && <g className="agent-focus-tether"><path data-agent-focus-tether d={tether.path} /><circle cx={tether.to.x} cy={tether.to.y} r="3" /></g>}
      {marks.filter(mark => mark.connection).map(mark => <path key={`${mark.layer}:${mark.itemId}`} data-agent-connection={mark.itemId}
        className={`agent-connection-preview footprint-${mark.layer}${mark.absent ? " footprint-absent" : ""}`} data-change-kind={mark.kind}
        d={mark.connection!.path} markerEnd={`url(#${arrowId})`} />)}
    </svg>
    {marks.map(mark => {
      const selected = work.inspectedDelta?.agentId === task.agent.id && work.inspectedDelta.itemId === mark.itemId && work.inspectedDelta.layer === mark.layer;
      const action = label(mark), offset = mark.connection ? 0 : mark.layer === "context" ? 0 : 4;
      return <div key={`${mark.layer}:${mark.itemId}`} className={`agent-footprint footprint-${mark.layer}${mark.ghost ? " footprint-ghost" : ""}${selected ? " footprint-selected" : ""}${mark.focus ? " footprint-focus" : ""}${mark.connection ? " footprint-relationship" : ""}${mark.absent ? " footprint-absent" : ""}`}
        data-agent-footprint={mark.layer} data-item-id={mark.itemId} data-change-kind={mark.kind}
        style={{ left: mark.bounds.x - offset, top: mark.bounds.y - offset, width: mark.bounds.width + offset * 2, height: mark.bounds.height + offset * 2 }}>
        <button data-view-control className="agent-footprint-label" title={`${name} · ${action}: ${mark.name}${mark.stale ? " · Saved model has changed" : ""}`}
          aria-label={`${name}: ${action} ${mark.name}`} aria-pressed={selected}
          onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); work.inspectDelta(task.agent.id, mark.itemId, mark.layer); }}>
          {(mark.showName || mark.connection) && <strong>{mark.name}</strong>}
          <span>{mark.ghost && !mark.connection ? `${typeNames[mark.itemType]} · ` : ""}{action}{mark.stale ? " · needs refresh" : ""}</span>
        </button>
      </div>;
    })}
  </div>;
}
