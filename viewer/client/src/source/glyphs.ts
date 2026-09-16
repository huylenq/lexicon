import type { SymbolKind } from "../../../shared/model";

export type SourceGlyphKind = SymbolKind | "symbol" | "heading" | "line" | "file" | "document";
/** Shared 20-unit paths for DOM labels and the Files bitmap. */
export const sourceGlyphs: Record<SourceGlyphKind, { label: string; path: string; light: string; dark: string }> = {
  class: { label: "Class", path: "M10 2.5 17 6.5V14L10 18 3 14V6.5ZM3 6.5 10 10.5 17 6.5M10 10.5V18", light: "#956521", dark: "#d7b46a" },
  function: { label: "Function", path: "M14 3h-2c-2 0-3 1.5-3.4 4L7.4 14c-.4 2.5-1.4 3-3.4 3H3M5 8h9", light: "#8153a8", dark: "#bd9adc" },
  method: { label: "Method", path: "M12 3h-1c-2 0-3 1.5-3.4 4L6.4 14c-.4 2.5-1.4 3-3.4 3H2M4 8h8M12 13h6m-3-3 3 3-3 3", light: "#8153a8", dark: "#bd9adc" },
  interface: { label: "Interface", path: "M6 3H3v14h3M14 3h3v14h-3M8 6h4M10 6v8M8 14h4", light: "#287e7a", dark: "#76c5bd" },
  type: { label: "Type alias", path: "M3 4h10M8 4v12M12 11h6m-6 4h6", light: "#397ba6", dark: "#8ebddd" },
  enum: { label: "Enum", path: "M3 4h4v4H3ZM3 12h4v4H3ZM11 5h6m-6 2h4m-4 6h6m-6 2h4", light: "#956521", dark: "#d7b46a" },
  variable: { label: "Variable", path: "M5 3H4C2 3 4 8 2 10c2 2 0 7 2 7h1M15 3h1c2 0 0 5 2 7-2 2 0 7-2 7h-1M8 7l4 6m0-6-4 6", light: "#397ba6", dark: "#8ebddd" },
  symbol: { label: "Symbol", path: "m10 3 7 7-7 7-7-7Z", light: "#717784", dark: "#9ba3af" },
  heading: { label: "Heading", path: "M5 4v12M15 4v12M5 10h10", light: "#717784", dark: "#9ba3af" },
  line: { label: "Line", path: "M9 4h8M9 10h8M9 16h8M2 7l3 3-3 3", light: "#717784", dark: "#9ba3af" },
  file: { label: "File", path: "M11 2H4v16h12V7ZM11 2v5h5", light: "#717784", dark: "#9ba3af" },
  document: { label: "Document", path: "M11 2H4v16h12V7ZM11 2v5h5M7 11h6m-6 3h6", light: "#717784", dark: "#9ba3af" },
};
