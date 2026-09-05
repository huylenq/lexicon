// Markdown-style inline code parser, shared between the DOM renderer
// (`<InlineCode>`) and graph node labels.

export interface CodePart {
  text: string;
  code: boolean;
}

export function splitBackticks(text: string): CodePart[] {
  if (!text.includes("`")) return [{ text, code: false }];
  const out: CodePart[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("`", i);
    if (start === -1) {
      out.push({ text: text.slice(i), code: false });
      break;
    }
    if (start > i) out.push({ text: text.slice(i, start), code: false });
    const end = text.indexOf("`", start + 1);
    if (end === -1) {
      // unterminated — render the rest as plain so the user sees their typo
      out.push({ text: text.slice(start), code: false });
      break;
    }
    out.push({ text: text.slice(start + 1, end), code: true });
    i = end + 1;
  }
  return out;
}
