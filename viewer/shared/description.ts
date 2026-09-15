export type DescriptionPart = string | { id: string; label?: string };

/** Deliberately small plain-text syntax, with no HTML or URL interpretation. */
export function descriptionParts(text: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  const references = /\[\[([^\s\[\]|]+)(?:\|([^\[\]\n]+))?\]\]/g;
  let end = 0;
  for (const match of text.matchAll(references)) {
    parts.push(text.slice(end, match.index));
    parts.push({ id: match[1]!, ...(match[2] ? { label: match[2].trim() } : {}) });
    end = match.index! + match[0].length;
  }
  parts.push(text.slice(end));
  return parts;
}
