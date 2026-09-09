import type { MouseEvent } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { readSelection } from "./graph/model";
import type { ReaderCard, ReaderOpenMode } from "./readerState";

export type ReaderSetParams = (
  input: Parameters<SetURLSearchParams>[0],
  options?: NonNullable<Parameters<SetURLSearchParams>[1]> & { readerMode?: ReaderOpenMode },
) => void;

/** Use the same gestures on Browse, reader links, breadcrumbs, and source owners. */
export function readerLink(open: (mode: ReaderOpenMode) => void) {
  const activate = (event: MouseEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.button === 0 && (event.shiftKey || event.altKey) && !event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    open(event.button === 1 || event.metaKey || event.ctrlKey ? "pinned" : "preview");
  };
  return {
    "data-reader-link": true,
    onClick: activate,
    onAuxClick: activate,
    onMouseDown: (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); },
  };
}

export function routeCard(params: URLSearchParams): ReaderCard {
  const selection = readSelection(params.get("selection"));
  return selection && selection.kind !== "code" ? selection :
    (params.get("item") ? { kind: "item", id: params.get("item")! } : { kind: "overview" });
}
export function cardParams(params: URLSearchParams, card?: ReaderCard) {
  const p = new URLSearchParams(params);
  for (const key of ["item", "selection", "focus", "shape"]) p.delete(key);
  if (card?.kind === "item") p.set("item", card.id);
  else if (card && card.kind !== "overview") p.set("selection", JSON.stringify(card));
  return p;
}
