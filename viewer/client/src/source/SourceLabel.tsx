import type { SourceLink } from "../../../shared/model";
import { sourceTargetLabel } from "./targets";
import { sourceIconUrl, useSourceTheme } from "./fileIcons";
import "./source.css";

export function SourceFileLabel({ file }: { file: string }) {
  const dark = useSourceTheme();
  return <span className="source-label" title={file}><img src={sourceIconUrl(file, dark)} width={18} height={18} alt="" /><span>{file.split("/").pop()}</span></span>;
}
export function SourceTargetLabel({ link }: { link: SourceLink }) {
  const { glyph, label, kind } = sourceTargetLabel(link);
  return <span className="source-label" title={`${kind}: ${label}`}><span className="source-target-glyph" aria-hidden="true">{glyph}</span><span>{label}</span></span>;
}
