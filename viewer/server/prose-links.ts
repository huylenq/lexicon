// Shared cold-layer fqid utilities. Pure TypeScript; no React, no I/O —
// imported by both `loader.ts` and the client's `Prose.tsx`.

import type { EntityRef } from "./schema.ts";

export interface ParsedLink {
  raw: string;
  fqid: string;
  label?: string;
  offset: number;
  length: number;
}

// Stricter than slug-only so qualified forms work. Disallow whitespace and `]`
// so the parser stays unambiguous when prose contains close brackets in code.
const LINK_RE = /\[\[([A-Za-z0-9][A-Za-z0-9\/\-_.]*?)(?:\|([^\]]+))?\]\]/g;

export function parseProseLinks(text: string): ParsedLink[] {
  if (!text || !text.includes("[[")) return [];
  const out: ParsedLink[] = [];
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    out.push({
      raw: m[1] + (m[2] ? `|${m[2]}` : ""),
      fqid: m[1],
      label: m[2]?.trim() || undefined,
      offset: m.index,
      length: m[0].length,
    });
  }
  return out;
}

// Pure resolver. Tries exact fqid, then `overlay/<id>` aliases (resolves to
// the system entity that owns the overlay), then owner-scoped guesses when
// `ownerContextId` is known, then common kind-prefixed shorthands, then a
// qualified `<context>/<slug>` split. Returns null if nothing matches.
//
// `systemRef` is only consulted for `overlay/<id>` resolution — overlays live
// as a list on the system entity rather than as standalone entities, so a
// prose link to one lands on the system page.
export function resolveFqid(
  raw: string,
  entities: Record<string, { ref: EntityRef }>,
  ownerContextId?: string | null,
  systemRef?: { ref: EntityRef; overlays?: { id: string }[] } | null,
): EntityRef | null {
  if (entities[raw]) return entities[raw].ref;
  if (raw.startsWith("overlay/")) {
    const overlayId = raw.slice("overlay/".length);
    if (systemRef?.overlays?.some(o => o.id === overlayId)) return systemRef.ref;
  }
  if (ownerContextId) {
    for (const c of [
      `${ownerContextId}/${raw}`,
      `${ownerContextId}/invariant/${raw}`,
      `${ownerContextId}/seam/${raw}`,
      `${ownerContextId}/rule/${raw}`,
    ]) if (entities[c]) return entities[c].ref;
  }
  for (const c of [
    `term/${raw}`,
    `invariant/${raw}`,
    `context/${raw}`,
    `decision/${raw}`,
    `surface/${raw}`,
  ]) if (entities[c]) return entities[c].ref;
  if (raw.includes("/")) {
    const [ctx, ...rest] = raw.split("/");
    const slug = rest.join("/");
    for (const g of [
      `${ctx}/${slug}`,
      `${ctx}/invariant/${slug}`,
      `${ctx}/seam/${slug}`,
      `${ctx}/rule/${slug}`,
    ]) if (entities[g]) return entities[g].ref;
  }
  return null;
}
