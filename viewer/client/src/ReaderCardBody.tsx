import { Link } from "react-router-dom";
import { related, type Model } from "../../shared/model";
import type { GraphIndex, GraphSelection, Target } from "./graph/model";
import type { ReaderCard, ReaderOpenMode } from "./readerState";
import { cardParams, readerLink } from "./readerNavigation";
import { Paragraph } from "./ui";
import Icon from "./Icon";
import ObjectName from "./ObjectName";
import SelectionReading from "./SelectionReading";

type Props = {
  card: ReaderCard;
  model?: Model;
  graphIndex?: GraphIndex;
  params: URLSearchParams;
  loading: boolean;
  allCode: boolean;
  codeTarget?: Target;
  copied: boolean;
  onSelect: (id?: string, mode?: ReaderOpenMode) => void;
  onSelectGraph: (selection: GraphSelection, mode?: ReaderOpenMode) => void;
  onCanvasAction: (action: "locate" | "expand", selection: GraphSelection) => void;
  onCode: (id: string, index: number) => void;
  onOpenChat: () => void;
  onCopy: (card: ReaderCard) => void;
};

export default function ReaderCardBody({ card, model, graphIndex, params, loading, allCode, codeTarget, copied,
  onSelect: select, onSelectGraph: selectGraph, onCanvasAction: graphAction, onCode: code, onOpenChat, onCopy }: Props) {
  const contexts = model?.items.filter(i => i.type === "context") || [];
  const relationships = model?.items.filter(i => i.type === "relationship") || [];
  const itemLink = (id: string, label: string, relationship = false) => {
    const linked = model?.items.find((i) => i.id === id);
    const p = cardParams(params, { kind: "item", id });
    return (
      <Link
        to={`?${p}`}
        className={relationship ? "relation-name" : "relation-entity"}
        aria-label={
          relationship ? `Read relationship: ${label}` : `Open ${label}`
        }
        {...readerLink(mode => select(id, mode))}
      >
        {linked ? <ObjectName type={linked.type} name={label} size={14}
          classification={linked.type === "concept" ? linked.classification : undefined} /> : label}
      </Link>
    );
  };
  const item = card.kind === "item" ? model?.items.find(i => i.id === card.id) : undefined;
  const specialSelection = card.kind !== "item" && card.kind !== "overview" ? card : undefined;
  const readerSelection = card.kind === "overview" ? undefined : card;
  const owner = item?.type === "concept" ? model?.items.find(i => i.id === item.context) : undefined;
  return (
    <>
      {owner && <nav className="reader-card-owner" aria-label="Owning context">{itemLink(owner.id, owner.name)}</nav>}
      {readerSelection && (
        <div className="reader-canvas-actions">
          <button
            className="quiet"
            onClick={() => graphAction("locate", readerSelection)}
          >
            Locate in canvas
          </button>
          {item && (
            <button
              className="quiet"
              disabled={allCode}
              title={allCode ? "Turn off Show all code to change individual expansions" : undefined}
              onClick={() =>
                graphAction("expand", { kind: "item", id: item.id })
              }
            >
              Toggle code in canvas
            </button>
          )}
        </div>
      )}

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
                {model.source === "legacy"
                  ? "Earlier model imported for reading"
                  : "Model needs attention"}{" "}
                · {model.issues.length} notices
              </summary>
              <ul>
                {model.issues.map((i, index) => (
                  <li key={index}>
                    <strong>{i.severity}</strong>{" "}
                    {i.item && (
                      <button onClick={() => select(i.item)}>
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
              <button onClick={() => select()}>Open overview</button>
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
              <Paragraph text={item?.description || model.description} />
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
                        <p>{ctx.description}</p>
                        <span className="card-link">
                          {
                            model.items.filter(
                              (i) =>
                                i.type === "concept" &&
                                i.context === ctx.id,
                            ).length
                          }{" "}
                          concepts <Icon name="arrow-right" />
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {item?.type === "context" && (
                <section>
                  <h2>Concepts in this context</h2>
                  <div className="concept-list">
                    {model.items
                      .filter(
                        (i) =>
                          i.type === "concept" && i.context === item.id,
                      )
                      .map((i) => (
                        <button key={i.id} {...readerLink(mode => select(i.id, mode))}>
                          <h3>
                            <ObjectName type={i.type} name={i.name}
                              classification={i.type === "concept" ? i.classification : undefined} />
                            <Icon name="open" />
                          </h3>
                          <p>{i.description}</p>
                        </button>
                      ))}
                  </div>
                  {!model.items.some(
                    (i) => i.type === "concept" && i.context === item.id,
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
                  {item.annotations.length > 0 && (
                    <section>
                      <h2>What matters here</h2>
                      {item.annotations.map((a, index) => (
                        <div className="annotation" key={index}>
                          <div className="annotation-label">
                            <span className="object-label"><Icon name="annotation" size={14} />{a.kind}</span>
                            {a.evidence && (
                              <span className={`evidence ${a.evidence}`}>
                                {a.evidence}
                              </span>
                            )}
                          </div>
                          <Paragraph text={a.text} />
                        </div>
                      ))}
                    </section>
                  )}
                  {item.type !== "relationship" && (
                    <section>
                      <div className="section-heading">
                        <h2 className="object-label"><Icon name="relationship" />Relationships</h2>
                        <span className="muted">
                          {related(model, item.id).length} connections
                        </span>
                      </div>
                      <div className="relation-list">
                        {related(model, item.id).map((r) => (
                          <div className="relation-row" key={r.id}>
                            <span className="relation-direction">
                              {r.from === item.id
                                ? "OUTGOING"
                                : "INCOMING"}
                            </span>
                            <span className="relation-sentence">
                              {itemLink(
                                r.from,
                                model.items.find((i) => i.id === r.from)
                                  ?.name || r.from,
                              )}{" "}
                              {itemLink(r.id, r.name, true)}{" "}
                              {itemLink(
                                r.to,
                                model.items.find((i) => i.id === r.to)
                                  ?.name || r.to,
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                      {!related(model, item.id).length && (
                        <p className="empty">
                          Relationships can be added when they help
                          explain this concept.
                        </p>
                      )}
                    </section>
                  )}
                  {item.codeLinks.length > 0 && (
                    <section>
                      <div className="section-heading">
                        <h2 className="object-label"><Icon name="code-link" />In the implementation</h2>
                        <span className="muted">
                          {item.codeLinks.length} code links
                        </span>
                      </div>
                      <div className="code-links">
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
                            <span className="code-role">
                              <span>{l.role}</span> <Icon name="open" size={14} />
                            </span>
                            <strong>
                              <ObjectName type="code-link" name={l.symbol || l.file.split("/").pop() || l.file} size={14} />
                            </strong>
                            <code>
                              {l.file}
                              {l.line ? `:${l.line}` : ""}
                            </code>
                            <p>{l.description}</p>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
              <div className="item-footer">
                <code>{item?.id || model.id}</code>
                <button
                  className="quiet"
                  onClick={() => onCopy(card)}
                >
                  <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </>
          )}
        </article>
      )}

    </>
  );
}
