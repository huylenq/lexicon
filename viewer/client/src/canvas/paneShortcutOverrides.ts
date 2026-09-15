import type { TLUiOverrides } from "tldraw";

/** Browse owns / and Cmd/Ctrl+/ in every canvas presentation. */
export const paneShortcutOverrides: TLUiOverrides = {
  actions(_editor, actions) {
    const result = { ...actions };
    for (const id of ["toggle-dark-mode", "open-cursor-chat"]) {
      if (result[id]) result[id] = { ...result[id], kbd: undefined };
    }
    return result;
  },
};
