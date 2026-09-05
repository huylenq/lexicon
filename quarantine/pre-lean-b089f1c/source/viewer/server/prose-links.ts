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

// Inclusive [start, end] index pairs of backtick code spans, so `parseProseLinks`
// can skip link-looking content inside them. A `[[foo]]` inside backticks is
// authored as a syntax illustration, not a real link — both the validator and
// the renderer must treat it as code.
function findCodeSpans(text: string): Array<[number, number]> {
  if (!text.includes("`")) return [];
  const spans: Array<[number, number]> = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("`", i);
    if (start === -1) break;
    const end = text.indexOf("`", start + 1);
    if (end === -1) break; // unterminated backtick — leave the rest scannable
    spans.push([start, end]);
    i = end + 1;
  }
  return spans;
}

export function parseProseLinks(text: string): ParsedLink[] {
  if (!text || !text.includes("[[")) return [];
  const codeSpans = findCodeSpans(text);
  const inCodeSpan = (offset: number) =>
    codeSpans.some(([s, e]) => offset >= s && offset <= e);
  const out: ParsedLink[] = [];
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (inCodeSpan(m.index)) continue;
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

// Pure resolver. Resolution order:
//   1. exact fqid hit
//   2. `overlay/<id>` aliases (overlays live as a list on the system entity)
//   3. owner-scoped fallbacks (sibling slugs within the owning context or kernel)
//   4. common kind-prefixed shorthands (`context/<slug>`, `kernel/<slug>`, `surface/<slug>`)
//   5. qualified split `<owner>/<slug>` for both contexts and kernels
//
// `systemRef` is only consulted for `overlay/<id>` resolution — overlays live
// as a list on the system entity rather than as standalone entities, so a
// prose link to one lands on the system page.
export function resolveFqid(
  raw: string,
  entities: Record<string, { ref: EntityRef }>,
  ownerContextId?: string | null,
  systemRef?: { ref: EntityRef; overlays?: { id: string }[] } | null,
  ownerKernelId?: string | null,
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
      `${ownerContextId}/aggregate/${raw}`,
      `${ownerContextId}/module/${raw}`,
    ]) if (entities[c]) return entities[c].ref;
  }
  if (ownerKernelId) {
    for (const c of [
      `kernel/${ownerKernelId}/${raw}`,
      `kernel/${ownerKernelId}/invariant/${raw}`,
    ]) if (entities[c]) return entities[c].ref;
  }
  for (const c of [
    `context/${raw}`,
    `kernel/${raw}`,
    `surface/${raw}`,
  ]) if (entities[c]) return entities[c].ref;
  if (raw.includes("/")) {
    const [head, ...rest] = raw.split("/");
    const tail = rest.join("/");
    for (const g of [
      `${head}/${tail}`,
      `${head}/invariant/${tail}`,
      `${head}/seam/${tail}`,
      `${head}/rule/${tail}`,
      `${head}/aggregate/${tail}`,
      `${head}/module/${tail}`,
    ]) if (entities[g]) return entities[g].ref;
  }
  return null;
}
