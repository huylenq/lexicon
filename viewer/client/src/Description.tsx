import { Fragment, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import type { Model } from "../../shared/model";
import { descriptionParts } from "../../shared/description";
import ObjectName from "./ObjectName";
import { useReaderHover } from "./ReaderHover";
import { cardParams, readerLink } from "./readerNavigation";
import type { ReaderOpenMode } from "./readerState";
import "./description.css";

/** References enrich prose; they do not add semantic relationships. */
export default function Description({ text, model, params, onSelect }: {
  text: string;
  model: Model;
  params?: URLSearchParams;
  onSelect?: (id: string, mode: ReaderOpenMode) => void;
}) {
  return <>{descriptionParts(text).map((part, index) => {
    if (typeof part === "string") return <Fragment key={index}>{part}</Fragment>;
    const target = model.items.find(item => item.id === part.id);
    const label = part.label || target?.name || part.id;
    if (!target) return <span key={index} className="description-missing" title={`Unavailable item: ${part.id}`}>{label}</span>;
    if (!onSelect || !params) return <Fragment key={index}>{label}</Fragment>;
    return <ReferenceLink key={index} itemId={target.id} className="description-reference"
      to={`?${cardParams(params, { kind: "item", id: target.id })}`}
      aria-label={`Open ${target.name}`}
      {...readerLink(mode => onSelect(target.id, mode))}>
      <ObjectName type={target.type} name={label} size={14}
        classification={target.type === "concept" ? target.classification : undefined} />
    </ReferenceLink>;
  })}</>;
}

function ReferenceLink({ itemId, onClick, onAuxClick, ...props }: ComponentProps<typeof Link> & { itemId: string }) {
  const hover = useReaderHover("Inline Reader preview");
  return <>
    <Link {...props} {...hover.bind({ kind: "item", id: itemId })}
      onClick={event => { hover.dismiss(); onClick?.(event); }}
      onAuxClick={event => { hover.dismiss(); onAuxClick?.(event); }} />
    {hover.preview}
  </>;
}
