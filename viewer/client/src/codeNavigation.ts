import { useEffect, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { mappingId, readSelection, type GraphIndex } from "./graph/model";

export type CodeLocation = { target: string; mapping?: string };

/** Upgrade shared URLs from either earlier navigation path without losing the reader. */
export function normalizeNavigation(
  params: URLSearchParams,
  index: GraphIndex,
) {
  const p = new URLSearchParams(params);
  const code = p.get("code");
  if (code && !code.startsWith("code:")) {
    const mapping = index.mappings.get(
      mappingId(code, Number(p.get("link") || 0)),
    );
    if (mapping) {
      p.set("code", mapping.target);
      p.set("codeMapping", mapping.id);
      p.set("focus", "code");
      p.delete("link");
    }
  }
  const selection = readSelection(p.get("selection"));
  if (selection?.kind === "code") {
    p.set("code", selection.id);
    p.delete("codeMapping");
    p.delete("selection");
    p.set("focus", "code");
  } else if (selection?.kind === "mapping" && !p.has("code")) {
    const mapping = index.mappings.get(selection.id);
    if (mapping) {
      p.set("code", mapping.target);
      p.set("codeMapping", mapping.id);
    }
  } else if (selection?.kind === "item") {
    p.set("item", selection.id);
    p.delete("selection");
  }
  return p;
}

export function codeParams(params: URLSearchParams, location: CodeLocation) {
  const p = new URLSearchParams(params);
  p.set("code", location.target);
  location.mapping
    ? p.set("codeMapping", location.mapping)
    : p.delete("codeMapping");
  p.delete("link");
  p.delete("codePane");
  p.set("focus", "code");
  return p;
}

const same = (a?: CodeLocation, b?: CodeLocation) =>
  a?.target === b?.target && a?.mapping === b?.mapping;

export function useCodeNavigation(
  params: URLSearchParams,
  setParams: SetURLSearchParams,
  index?: GraphIndex,
) {
  const normalized = index ? normalizeNavigation(params, index) : params;
  const serialized = normalized.toString();
  useEffect(() => {
    if (serialized !== params.toString())
      setParams(serialized, { replace: true });
  }, [serialized, params, setParams]);

  const targetId = normalized.get("code");
  const mappingId = normalized.get("codeMapping");
  const location = targetId
    ? { target: targetId, mapping: mappingId || undefined }
    : undefined;
  const open =
    normalized.get("codePane") !== "closed" &&
    (!!targetId || normalized.get("codePane") === "open");
  const target = index?.targets.get(targetId || "");
  const mapping = target?.mappings.find((m) => m.id === mappingId);
  const [history, setHistory] = useState<{
    entries: CodeLocation[];
    cursor: number;
  }>({ entries: [], cursor: -1 });
  // Browser history and old shared links also enter the Code location history.
  useEffect(() => {
    if (!index || !location) return;
    setHistory((h) => {
      if (same(h.entries[h.cursor], location)) return h;
      const existing = h.entries.findIndex((entry) => same(entry, location));
      return existing >= 0
        ? { ...h, cursor: existing }
        : {
            entries: [...h.entries.slice(0, h.cursor + 1), location],
            cursor: h.cursor + 1,
          };
    });
  }, [targetId, mappingId, index]);

  const navigate = (next: CodeLocation, readMapping = false) => {
    const p = codeParams(normalized, next);
    if (readMapping && next.mapping) {
      p.set("selection", JSON.stringify({ kind: "mapping", id: next.mapping }));
      p.delete("item");
    }
    setHistory((h) =>
      same(h.entries[h.cursor], next)
        ? h
        : {
            entries: [...h.entries.slice(0, h.cursor + 1), next],
            cursor: h.cursor + 1,
          },
    );
    setParams(p);
  };
  const move = (delta: number) => {
    const cursor = history.cursor + delta;
    const next = history.entries[cursor];
    if (!next) return;
    setHistory({ ...history, cursor });
    setParams(codeParams(normalized, next));
  };
  const visibility = (visible: boolean) => {
    const p = new URLSearchParams(normalized);
    p.set("codePane", visible ? "open" : "closed");
    setParams(p);
  };
  return {
    open,
    targetId,
    target,
    mapping,
    navigate,
    visibility,
    back: () => move(-1),
    forward: () => move(1),
    canBack: history.cursor > 0,
    canForward: history.cursor < history.entries.length - 1,
  };
}
