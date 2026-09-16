import { createContext, useContext } from "react";
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  type TLShape,
  type TLUiContextMenuProps,
} from "tldraw";
import Icon from "../Icon";
import type { GraphSelection } from "../graph/model";

export const CanvasActions = createContext({
  selectionForShape: (_shape: TLShape): GraphSelection | undefined => undefined,
  focus: (_selection: GraphSelection) => {},
});

export function CanvasContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor();
  const actions = useContext(CanvasActions);
  const selected = useValue(
    "Model context menu",
    () => editor.getSelectedShapes(),
    [editor],
  );
  const selection =
    selected.length === 1 ? actions.selectionForShape(selected[0]) : undefined;
  return (
    <DefaultContextMenu {...props}>
      {selection && (
        <div
          className="tlui-menu__group"
          role="group"
          aria-label="Model actions"
        >
          <TldrawUiMenuItem
            id="lexicon-focus"
            label="lexicon.focus"
            iconLeft={
              <span>
                <Icon name="locate" />
              </span>
            }
            onSelect={() => actions.focus(selection)}
          />
        </div>
      )}
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}
