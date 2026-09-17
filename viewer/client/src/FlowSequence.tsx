import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { type Flow, type Model } from "../../shared/model";
import type { ReaderOpenMode } from "./readerState";
import { cardParams, readerLink } from "./readerNavigation";
import ObjectName from "./ObjectName";
import { indexModel } from "./graph/model";
import { projectSequence, type FlowCodeTarget } from "./graph/flow";
import "./styles/flow.css";

/** Code lifelines expand within their architecture owner; occurrence order stays unchanged. */
export default function FlowSequence({ flow, model, params, onSelect, onCode }: {
  flow: Flow;
  model: Model;
  params: URLSearchParams;
  onSelect: (id?: string, mode?: ReaderOpenMode) => void;
  onCode: (id: string, index: number) => void;
}) {
  const marker = `flow-arrow-${useId().replace(/:/g, "")}`;
  const [showCode, setShowCode] = useState(false);
  const { groups, lanes, rows } = projectSequence(indexModel(model), flow, showCode);
  const hasCode = flow.steps.some(step => step.caller !== undefined || step.callee !== undefined || step.callSite !== undefined);
  const laneWidth = showCode ? 190 : 160, padding = 24;
  const x = (id: string) => padding + laneWidth * (lanes.findIndex(lane => lane.id === id) + 0.5);
  const last = lanes.at(-1)?.id;
  const selfAtEnd = rows.some(({ fromLane, toLane }) => fromLane && fromLane === toLane && fromLane === last);
  const width = Math.max(2, lanes.length) * laneWidth + padding * 2 + (selfAtEnd ? laneWidth / 2 : 0);
  const linkTo = (id: string) => `?${cardParams(params, { kind: "item", id })}`;
  const codeButton = ({ link, index }: FlowCodeTarget, prefix = "Open code") => <button type="button"
    className="flow-code-target" onClick={() => onCode(flow.id, index)}
    aria-label={`${prefix}: ${link.symbol || `${link.file}:${link.line}`}`}
    title={link.description}>
    <code>{link.symbol || `Line ${link.line}`}</code>
    <span>{link.file}{link.line ? `:${link.line}` : ""}</span>
  </button>;
  return <section className="flow-section">
    <div className="section-heading"><h2>Sequence</h2>
      {hasCode ? <label className="flow-code-toggle"><input type="checkbox" checked={showCode} onChange={event => setShowCode(event.target.checked)} />Show code</label>
        : <span className="muted">Read from top to bottom</span>}
    </div>
    <div className="flow-scroll" role="region" aria-label={`Sequence diagram: ${flow.name}`} tabIndex={0}>
      <div className="flow-sequence" data-detail={showCode ? "code" : "architecture"} style={{ width }}>
        <div className="flow-participants" style={{ gridTemplateColumns: groups.map(group => `${group.lanes.length * laneWidth}px`).join(" "), paddingInline: padding }}>
          {groups.map(({ actor, lanes: groupLanes }) => <div key={actor.id} className="flow-participant-group" data-participant={actor.id}>
            <Link to={linkTo(actor.id)} className="flow-participant"
              aria-label={`Open participant: ${actor.name}`} {...readerLink(mode => onSelect(actor.id, mode))}>
              <ObjectName type={actor.type} name={actor.name} />
            </Link>
            {showCode && <div className="flow-code-lanes" style={{ gridTemplateColumns: `repeat(${groupLanes.length}, ${laneWidth}px)` }}>
              {groupLanes.map(lane => <div key={lane.id} className="flow-code-lane">
                {lane.code ? codeButton(lane.code) : <span className="flow-code-unspecified">{actor.type === "person" ? "User role" : "Code not specified"}</span>}
              </div>)}
            </div>}
          </div>)}
        </div>
        <div className="flow-timeline">
          <div className="flow-lifelines" aria-hidden="true">{lanes.map(lane =>
            <span key={lane.id} style={{ left: x(lane.id) }} />
          )}</div>
          <ol className="flow-steps" aria-label="Ordered interactions">
            {rows.map(({ step, relationship, from, to, fromLane, toLane, callSite, missingCode }, index) => {
              if (!relationship || !from || !to || !fromLane || !toLane) return <li key={`${step.id}:${index}`} data-step-id={step.id} className="flow-missing">
                {index + 1}. {step.label || "Unlabeled step"}<br />Unavailable relationship or Architecture participant: {step.relationship}
              </li>;
              const a = x(fromLane), b = x(toLane), self = a === b;
              const messageStyle = { marginLeft: Math.min(a, b) + 8, width: self ? laneWidth - 16 : Math.abs(b - a) - 16 };
              return <li key={`${step.id}:${index}`} data-step-id={step.id}>
                <Link to={linkTo(relationship.id)} className="flow-message"
                  style={messageStyle}
                  aria-label={`Step ${index + 1}: ${from.name} to ${to.name}: ${step.label}`}
                  {...readerLink(mode => onSelect(relationship.id, mode))}>
                  <span className="flow-step-number">{index + 1}.</span> {step.label}
                </Link>
                <svg className="flow-arrow" width={width} height={self ? 32 : 16} aria-hidden="true">
                  <defs><marker id={`${marker}-${index}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </marker></defs>
                  <path d={self ? `M ${a} 2 H ${a + 60} V 26 H ${a}` : `M ${a} 8 H ${b}`}
                    fill="none" stroke="currentColor" strokeWidth="1.4" markerEnd={`url(#${marker}-${index})`} />
                </svg>
                {showCode && callSite && <div className="flow-call-site" style={messageStyle}>
                  <span>Call site</span>{codeButton(callSite, `Open call site for step ${index + 1}`)}
                </div>}
                {showCode && missingCode.length > 0 && <p className="flow-code-error" style={messageStyle}>Unavailable code reference: {missingCode.join(", ")}</p>}
              </li>;
            })}
          </ol>
          {!flow.steps.length && <p className="flow-missing">This flow has no steps yet.</p>}
        </div>
      </div>
    </div>
    <p className="flow-hint">Select a participant to read its responsibility, or a message to inspect the relationship and its code.</p>
  </section>;
}
