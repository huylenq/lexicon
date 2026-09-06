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
  toggleCode: (_selection: GraphSelection) => {},
  codeState: (
    _selection: GraphSelection,
  ): "none" | "expanded" | "collapsed" | "all" => "none",
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
  const code = selection && actions.codeState(selection);
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
          {code !== "none" && (
            <TldrawUiMenuItem
              id="lexicon-code"
              disabled={code === "all"}
              label={
                code === "expanded"
                  ? "lexicon.hide-code"
                  : "lexicon.expand-code"
              }
              iconLeft={
                <span>
                  <Icon name="code" />
                </span>
              }
              onSelect={() => actions.toggleCode(selection)}
            />
          )}
        </div>
      )}
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}
