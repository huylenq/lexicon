import type { CSSProperties } from "react";
import type { ModelItem } from "../../shared/model";
import type { ReaderCard, ReaderOpenMode } from "./readerState";
import { readerLink } from "./readerNavigation";
import Icon from "./Icon";
import ObjectName, { objectTone } from "./ObjectName";

type Props = {
  card: ReaderCard;
  item?: ModelItem;
  title: string;
  preview: boolean;
  collapsed: boolean;
  style?: CSSProperties;
  onOpen: (mode: ReaderOpenMode, reveal?: boolean) => void;
  onClose: () => void;
};

export default function ReaderCardHeader({ card, item, title, preview, collapsed, style, onOpen, onClose }: Props) {
  const tone = item
    ? objectTone(item.type, item.type === "concept" ? item.classification : undefined)
    : card.kind === "mapping" ? "code-link" : card.kind === "bundle" ? "relationship" : undefined;
  return (
    <header className="reader-card-header" data-reader-mode={preview ? "preview" : "pinned"} data-tone={tone} style={style}>
      <button className="reader-card-title" aria-label={`${collapsed ? "Reveal card" : "Read card"}: ${title}`}
        {...readerLink(mode => onOpen(mode))} title={`Read ${title}`}>
        <h1>{item ? <ObjectName type={item.type} classification={item.type === "concept" ? item.classification : undefined} name={title} size={collapsed ? 14 : 18} /> : title}</h1>
      </button>
      {preview && <button className="reader-preview-badge" data-pin-card aria-label={`Pin ${title}`}
        title="Preview · dismissed when you open another item. Click to keep it."
        onClick={() => onOpen("pinned", false)}>Preview</button>}
      <button className="quiet icon-button" data-close-card aria-label={`Close ${collapsed ? "collapsed " : ""}${title}`} onClick={onClose}><Icon name="close" /></button>
    </header>
  );
}
