import { useId } from "react";
import { Link } from "react-router-dom";
import { type Flow, type Model } from "../../shared/model";
import type { ReaderOpenMode } from "./readerState";
import { cardParams, readerLink } from "./readerNavigation";
import ObjectName from "./ObjectName";
import { indexModel, projectFlow } from "./graph/model";
import "./styles/flow.css";

/** One lifeline per referenced object; each step remains a distinct occurrence. */
export default function FlowSequence({ flow, model, params, onSelect }: {
  flow: Flow;
  model: Model;
  params: URLSearchParams;
  onSelect: (id?: string, mode?: ReaderOpenMode) => void;
}) {
  const marker = `flow-arrow-${useId().replace(/:/g, "")}`;
  const { actors, interactions } = projectFlow(indexModel(model), flow);
  const lane = 160, padding = 24;
  const x = (id: string) => padding + lane * (actors.findIndex(actor => actor.id === id) + 0.5);
  const last = actors.at(-1)?.id;
  const selfAtEnd = interactions.some(({ from, to }) => from && from.id === to?.id && from.id === last);
  const width = Math.max(2, actors.length) * lane + padding * 2 + (selfAtEnd ? lane / 2 : 0);
  const linkTo = (id: string) => `?${cardParams(params, { kind: "item", id })}`;
  return <section className="flow-section">
    <div className="section-heading"><h2>Sequence</h2><span className="muted">Read from top to bottom</span></div>
    <div className="flow-scroll" role="region" aria-label={`Sequence diagram: ${flow.name}`} tabIndex={0}>
      <div className="flow-sequence" style={{ width }}>
        <div className="flow-participants" style={{ gridTemplateColumns: `repeat(${Math.max(1, actors.length)}, ${lane}px)`, paddingInline: padding }}>
          {actors.map(actor => <Link key={actor.id} to={linkTo(actor.id)} className="flow-participant"
            aria-label={`Open participant: ${actor.name}`} {...readerLink(mode => onSelect(actor.id, mode))}>
            <ObjectName type={actor.type} name={actor.name} classification={actor.type === "concept" ? actor.classification : undefined} />
          </Link>)}
        </div>
        <div className="flow-timeline">
          <div className="flow-lifelines" aria-hidden="true">{actors.map(actor =>
            <span key={actor.id} style={{ left: x(actor.id) }} />
          )}</div>
          <ol className="flow-steps" aria-label="Ordered interactions">
            {interactions.map(({ step, relationship, from, to }, index) => {
              if (!relationship || !from || !to) return <li key={`${step.id}:${index}`} data-step-id={step.id} className="flow-missing">
                {index + 1}. {step.label || "Unlabeled step"}<br />Unavailable relationship or participant: {step.relationship}
              </li>;
              const a = x(from.id), b = x(to.id), self = a === b;
              return <li key={`${step.id}:${index}`} data-step-id={step.id}>
                <Link to={linkTo(relationship.id)} className="flow-message"
                  style={{ marginLeft: Math.min(a, b) + 8, width: self ? lane - 16 : Math.abs(b - a) - 16 }}
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
