import type { ElementDimension } from "../../../shared/model";
import { CanvasToggleGroup } from "./Toolbar";
import type { CanvasPresentation, CanvasSkin, CanvasView } from "./viewState";

type CanvasViewControlsProps = {
  onPresentation: (presentation: CanvasPresentation) => void;
} & ({
  presentation: "flat";
  view: CanvasView;
  onDimension: (dimension: ElementDimension) => void;
  onSkin: (skin: CanvasSkin) => void;
} | {
  presentation: "layers";
});

/** Keep the same controls in every presentation; disable inapplicable choices. */
export function CanvasViewControls(props: CanvasViewControlsProps) {
  const flat = props.presentation === "flat" ? props : undefined;
  return <div className="toolbar-view-controls" role="group" aria-label="Canvas controls">
    <CanvasToggleGroup className="canvas-presentation" label="Canvas presentation"
      value={props.presentation} onChange={props.onPresentation}
      options={[{ value: "flat", label: "2D", icon: "overview" }, { value: "layers", label: "Layers", icon: "layers" }]} />
    <CanvasToggleGroup<ElementDimension> label="Dimension" value={flat?.view.dimension} disabled={!flat}
      onChange={value => flat?.onDimension(value)}
      options={[
        { value: "domain", label: "Domain", icon: "context" },
        { value: "architecture", label: "Architecture", icon: "component", disabled: !flat?.view.hasArchitecture },
      ]} />
    <CanvasToggleGroup<CanvasSkin> label="2D skin" value={flat?.view.skin} disabled={!flat}
      onChange={value => flat?.onSkin(value)}
      options={[
        { value: "standard", label: "Standard", icon: "graph" },
        { value: "ink", label: "Ink", title: "Atlas · Ink", icon: "ink", disabled: !flat?.view.atlasAvailable },
        { value: "village", label: "Village", title: "Atlas · Village", icon: "village", disabled: !flat?.view.atlasAvailable },
      ]} />
  </div>;
}
