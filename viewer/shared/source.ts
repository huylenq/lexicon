import type { SourceLink } from "./model";

/** CommonMark treats CRLF, LF, and bare CR as line endings. Preserve the source bytes. */
export const sourceLines = (text: string) => text.split(/\r\n?|\n/);

/** File type describes presentation, while the authored role describes evidence. */
export const isMarkdownFile = (file: string) => /\.(md|markdown|mdown)$/i.test(file);
export const sourceKind = (link: SourceLink) => link.kind === "document" ? "Document" : "Code";
export const sourceLabel = (link: SourceLink) => link.heading || link.symbol ||
  (link.line ? `Line ${link.line}` : link.file.split("/").pop() || link.file);

export interface MarkdownHeading {
  id: string;
  title: string;
  depth: number;
  startLine: number;
  endLine: number;
}

/** No locator means the link addresses the file itself. */
export const isWholeFileSource = (link: SourceLink) => !link.symbol && !link.heading && !link.line;
