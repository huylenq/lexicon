import { sourceGlyphs } from "./glyphs";
import { useSymbolKind } from "./SourceMetadata";
import type { SourceLink } from "../../../shared/model";
import { sourceTargetLabel, sourceGlyphKind } from "./targets";
import { sourceIconUrl, useSourceTheme } from "./fileIcons";
import "./source.css";

export function SourceFileLabel({ file }: { file: string }) {
  const dark = useSourceTheme();
  return <span className="source-label" title={file}><img src={sourceIconUrl(file, dark)} width={18} height={18} alt="" /><span>{file.split("/").pop()}</span></span>;
}
export function SourceTargetLabel({ link }: { link: SourceLink }) {
  const symbolKind = useSymbolKind(link), dark = useSourceTheme();
  const { label, kind } = sourceTargetLabel(link, symbolKind);
  const glyphKind = sourceGlyphKind(link, symbolKind), glyph = sourceGlyphs[glyphKind];
  return <span className="source-label" title={`${kind}: ${label}`} data-source-target-kind={glyphKind}>
    <svg className="source-target-glyph" width={18} height={18} viewBox="0 0 20 20" aria-hidden="true" focusable="false"
      style={{ color: dark ? glyph.dark : glyph.light }} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={glyph.path} />
    </svg><span>{label}</span>
  </span>;
}
