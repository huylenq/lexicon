import type { CSSProperties } from "react";
import type { ModelItem } from "../../shared/model";
import type { ReaderCard, ReaderOpenMode } from "./readerState";
import { readerLink } from "./readerNavigation";
import Icon from "./Icon";
import { useTooltip } from "./useTooltip";
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
  copied: boolean;
  onCopy: () => void;
  allCode: boolean;
  onCanvasAction: (action: "locate" | "expand") => void;
};

export default function ReaderCardHeader({ card, item, title, preview, collapsed, style, onOpen, onClose, copied, onCopy, allCode, onCanvasAction }: Props) {
  const copyLabel = copied ? "Copied" : "Copy link";
  const locateTip = useTooltip<HTMLButtonElement>("Locate in canvas");
  const sourcesTip = useTooltip<HTMLButtonElement>(allCode ? "Turn off Show all sources to change individual expansions" : "Toggle sources in canvas");
  const copyTip = useTooltip<HTMLButtonElement>(copyLabel);
  const tone = item
    ? objectTone(item.type, item.type === "concept" ? item.classification : undefined)
    : card.kind === "mapping" ? "code-link" : card.kind === "bundle" ? "relationship" : undefined;
  return (
    <header className="reader-card-header" data-reader-mode={preview ? "preview" : "pinned"} data-tone={tone} style={style}>
      <button className="reader-card-title" aria-label={`${collapsed ? "Reveal card" : "Read card"}: ${title}`}
        {...readerLink(mode => onOpen(mode))} title={`Read ${title}`}>
        <h1>{item ? <ObjectName type={item.type} classification={item.type === "concept" ? item.classification : undefined} name={title} size={collapsed ? 14 : 18} /> : title}</h1>
      </button>
      {!collapsed && <>
      {preview && <button className="reader-preview-badge" data-pin-card aria-label={`Pin ${title}`}
        title="Preview · dismissed when you open another item. Click to keep it."
        onClick={() => onOpen("pinned", false)}>Preview</button>}
      {card.kind !== "overview" && item?.type !== "flow" && <>
        <button ref={locateTip.anchor} className="quiet icon-button reader-card-canvas-action" aria-label="Locate in canvas"
          aria-describedby={locateTip.describedBy} onPointerEnter={locateTip.onPointerEnter} onPointerLeave={locateTip.onPointerLeave}
          onFocus={locateTip.onFocus} onBlur={locateTip.onBlur} onClick={() => onCanvasAction("locate")}>
          <Icon name="locate" />
        </button>
        {locateTip.tooltip}
        {item && <>
          <button ref={sourcesTip.anchor} className="quiet icon-button reader-card-canvas-action" aria-label="Toggle sources in canvas"
            aria-disabled={allCode} aria-describedby={sourcesTip.describedBy}
            onPointerEnter={sourcesTip.onPointerEnter} onPointerLeave={sourcesTip.onPointerLeave}
            onFocus={sourcesTip.onFocus} onBlur={sourcesTip.onBlur} onClick={() => { if (!allCode) onCanvasAction("expand"); }}>
            <Icon name="code-link" />
          </button>
          {sourcesTip.tooltip}
        </>}
      </>}
      <button ref={copyTip.anchor} className="quiet icon-button reader-card-copy" aria-label={copyLabel}
        aria-describedby={copyTip.describedBy} onPointerEnter={copyTip.onPointerEnter}
        onPointerLeave={copyTip.onPointerLeave} onFocus={copyTip.onFocus} onBlur={copyTip.onBlur}
        onClick={onCopy}>
        <Icon name={copied ? "check" : "copy"} />
      </button>
      {copyTip.tooltip}
      </>}
      <button className="quiet icon-button" data-close-card aria-label={`Close ${collapsed ? "collapsed " : ""}${title}`} onClick={onClose}><Icon name="close" /></button>
    </header>
  );
}
