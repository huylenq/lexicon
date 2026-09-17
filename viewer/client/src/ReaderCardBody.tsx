import { sourceLabel } from "../../shared/source";
import { Link } from "react-router-dom";
import { flowsFor, parentOf, isArchitecture, typeNames, type Model } from "../../shared/model";
import type { GraphIndex, GraphSelection, Target } from "./graph/model";
import type { ReaderCard, ReaderOpenMode } from "./readerState";
import { cardParams, readerLink } from "./readerNavigation";
import { Paragraph } from "./ui";
import Description from "./Description";
import Icon from "./Icon";
import ObjectName from "./ObjectName";
import SelectionReading from "./SelectionReading";
import FlowSequence from "./FlowSequence";

type Props = {
  card: ReaderCard;
  model?: Model;
  graphIndex?: GraphIndex;
  params: URLSearchParams;
  loading: boolean;
  codeTarget?: Target;
  onSelect: (id?: string, mode?: ReaderOpenMode) => void;
  onSelectGraph: (selection: GraphSelection, mode?: ReaderOpenMode) => void;
  onCode: (id: string, index: number) => void;
  onOpenChat: () => void;
};

export default function ReaderCardBody({ card, model, graphIndex, params, loading, codeTarget,
  onSelect: select, onSelectGraph: selectGraph, onCode: code, onOpenChat }: Props) {
  const contexts = model?.items.filter(i => i.type === "context") || [];
  const relationships = model?.items.filter(i => i.type === "relationship") || [];
  const architectureRoots = model?.items.filter(i => isArchitecture(i) && !parentOf(i)) || [];
  const itemLink = (id: string, label: string) => {
    const linked = model?.items.find((i) => i.id === id);
    const p = cardParams(params, { kind: "item", id });
    return (
      <Link
        to={`?${p}`}
        aria-label={`Open ${label}`}
        {...readerLink(mode => select(id, mode))}
      >
        {linked ? <ObjectName type={linked.type} name={label} size={14}
          classification={linked.type === "concept" ? linked.classification : undefined} /> : label}
      </Link>
    );
  };
  const item = card.kind === "item" ? model?.items.find(i => i.id === card.id) : undefined;
  const specialSelection = card.kind !== "item" && card.kind !== "overview" ? card : undefined;
  const flows = model ? item ? flowsFor(model, item.id) : model.items.filter(i => i.type === "flow") : [];
  return (
    <>
      {!model && loading && (
        <p className="empty" role="status">
          Opening the model…
        </p>
      )}
      {model && (
        <article>
          {model.items.length === 0 && <div className="empty-model-start">
            <h2>Start with a question.</h2>
            <p>This project has no modeled concepts yet. Ask about an area of the implementation, then shape the model together.</p>
            <button className="primary" onClick={onOpenChat}>Open Chat</button>
          </div>}
          {model.issues.length > 0 && (
            <details className="issues">
              <summary>
                Model needs attention{" "}
                · {model.issues.length} notices
              </summary>
              <ul>
                {model.issues.map((i, index) => (
                  <li key={index}>
                    <strong>{i.severity}</strong>{" "}
                    {i.item && (
                      <button {...readerLink(mode => select(i.item, mode))}>
                        {i.item}
                      </button>
                    )}{" "}
                    {i.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {specialSelection &&
          graphIndex ? (
            <SelectionReading
              selection={specialSelection}
              index={graphIndex}
              onSelect={selectGraph}
            />
          ) : card.kind === "item" && card.id && !item ? (
            <div className="empty">
              <h2>That item is unavailable.</h2>
              <p>The model may have changed. Browse a context or return to the overview.</p>
              <button {...readerLink(mode => select(undefined, mode))}>Open overview</button>
            </div>
          ) : (
            <>
              {!item && <div className="eyebrow">The system at a glance</div>}
              {item?.type === "relationship" && (
                <div className="relationship-endpoints">
                  {itemLink(item.from, model.items.find((i) => i.id === item.from)?.name || item.from)}
                  <Icon name="arrow-right" />
                  {itemLink(item.to, model.items.find((i) => i.id === item.to)?.name || item.to)}
                </div>
              )}
              {item && isArchitecture(item) && <div className="eyebrow">{typeNames[item.type]}</div>}
              {item?.type === "flow" && <div className="eyebrow">Flow · {item.steps.length} steps</div>}
              <p className="prose"><Description text={item?.description || model.description} model={model} params={params} onSelect={select} /></p>
              {item?.type === "flow" && <FlowSequence flow={item} model={model} params={params} onSelect={select} onCode={code} />}
              {!item && (
                <>
                  <div className="stats">
                    <span>
                      <b>{contexts.length}</b> contexts
                    </span>
                    <span>
                      <b>
                        {
                          model.items.filter((i) => i.type === "concept")
                            .length
                        }
                      </b>{" "}
                      concepts
                    </span>
                    <span>
                      <b>{relationships.length}</b> relationships
                    </span>
                  </div>
                  <div className="section-heading">
                    <h2>Understand it by context</h2>
                  </div>
                  <div className="context-grid">
                    {contexts.map((ctx) => (
                      <button
                        className="context-card"
                        {...readerLink(mode => select(ctx.id, mode))}
                        key={ctx.id}
                      >
                        <h3><ObjectName type="context" name={ctx.name} /></h3>
                        <p><Description text={ctx.description} model={model} /></p>
                        <span className="card-link">
                          {
                            model.items.filter(
                              (i) =>
                                i.type === "concept" &&
                                i.parent === ctx.id,
                            ).length
                          }{" "}
                          concepts <Icon name="arrow-right" />
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!item && architectureRoots.length > 0 && <section>
                <h2>Architecture</h2>
                <div className="context-grid">{architectureRoots.map(root =>
                  <button className="context-card" key={root.id} {...readerLink(mode => select(root.id, mode))}>
                    <h3><ObjectName type={root.type} name={root.name} /></h3>
                    <p><Description text={root.description} model={model} /></p>
                  </button>
                )}</div>
              </section>}
              {item && isArchitecture(item) && model.items.some(i => parentOf(i) === item.id) && <section>
                <h2>Inside {item.name}</h2>
                <div className="concept-list">{model.items.filter(i => parentOf(i) === item.id).map(child =>
                  <button key={child.id} {...readerLink(mode => select(child.id, mode))}>
                    <h3><ObjectName type={child.type} name={child.name} /></h3>
                    <p><Description text={child.description} model={model} /></p>
                  </button>
                )}</div>
              </section>}
              {item?.type === "context" && (
                <section>
                  <h2>Concepts in this context</h2>
                  <div className="concept-list">
                    {model.items
                      .filter(
                        (i) =>
                          i.type === "concept" && i.parent === item.id,
                      )
                      .map((i) => (
                        <button key={i.id} {...readerLink(mode => select(i.id, mode))}>
                          <h3>
                            <ObjectName type={i.type} name={i.name}
                              classification={i.type === "concept" ? i.classification : undefined} />
                            <Icon name="open" />
                          </h3>
                          <p><Description text={i.description} model={model} /></p>
                        </button>
                      ))}
                  </div>
                  {!model.items.some(
                    (i) => i.type === "concept" && i.parent === item.id,
                  ) && (
                    <p className="empty">
                      This context has its explanation; concepts can be
                      added as questions emerge.
                    </p>
                  )}
                </section>
              )}
              {item && (
                <>
                  {item.annotations.map((a, index) => (
                    <section className="annotation" key={index}>
                      <div className="section-heading annotation-label">
                        <h2 className="object-label"><Icon name="annotation" />{a.kind.charAt(0).toUpperCase() + a.kind.slice(1)}</h2>
                        {a.evidence && (
                          <span className={`evidence ${a.evidence}`}>
                            {a.evidence}
                          </span>
                        )}
                      </div>
                      <Paragraph text={a.text} />
                    </section>
                  ))}
                  {item.codeLinks.length > 0 && (
                    <section>
                      <div className="section-heading">
                        <h2 className="object-label"><Icon name="code-link" />Source Links</h2>
                        <span className="muted">
                          {item.codeLinks.length} source {item.codeLinks.length === 1 ? "link" : "links"}
                        </span>
                      </div>
                      <div className="source-links">
                        {item.codeLinks.map((l, index) => (
                          <button
                            key={index}
                            onClick={() => code(item.id, index)}
                            className={
                              codeTarget?.mappings.some(
                                (m) =>
                                  m.owner.id === item.id &&
                                  m.index === index,
                              )
                                ? "selected"
                                : ""
                            }
                          >
                            <span className="source-heading">
                              <strong>
                                <ObjectName type={l.kind} name={sourceLabel(l)} size={14} />
                              </strong>
                              <span className="source-role">{l.role}</span>
                              <Icon name="open" size={14} />
                            </span>
                            <code>
                              {l.file}
                              {l.heading ? `#${l.heading}` : l.line ? `:${l.line}` : ""}
                            </code>
                            <p>{l.description}</p>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
              {flows.length > 0 && <section className="related-flows">
                <h2 className="object-label"><Icon name="flow" />{item ? "Flows through here" : "Follow a flow"}</h2>
                <div className="concept-list">{flows.map(flow =>
                  <button key={flow.id} {...readerLink(mode => select(flow.id, mode))}>
                    <h3><ObjectName type="flow" name={flow.name} /></h3>
                    <p><Description text={flow.description} model={model} /></p>
                  </button>
                )}</div>
              </section>}
            </>
          )}
        </article>
      )}

    </>
  );
}
