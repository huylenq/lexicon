import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Horizontal reading stack of entity panes. The leading pane's fqid is encoded
// in the URL path (`/p/:id/<fqid>`); the rest ride in `?stacked=...` query
// params. State lives in this provider so RefLink (anywhere in the tree under
// a pane) can dispatch into the stack.

interface StackCtx {
  panes: string[]; // fqids, in left-to-right order
  pushPane: (fqid: string, fromIndex: number) => void;
  closePane: (index: number) => void;
  flashSignal: { index: number; nonce: number } | null;
  paneIndexOf: (fqid: string) => number;
}

const Ctx = createContext<StackCtx | null>(null);

export function StackProvider({
  panes,
  setPanes,
  children,
}: {
  panes: string[];
  setPanes: (next: string[]) => void;
  children: ReactNode;
}) {
  const [flashSignal, setFlashSignal] = useState<StackCtx["flashSignal"]>(null);

  const pushPane = useCallback<StackCtx["pushPane"]>(
    (fqid, fromIndex) => {
      const existing = panes.indexOf(fqid);
      if (existing >= 0) {
        setFlashSignal({ index: existing, nonce: Date.now() });
        return;
      }
      // Insert immediately after the pane the click came from.
      const next = [
        ...panes.slice(0, fromIndex + 1),
        fqid,
        ...panes.slice(fromIndex + 1),
      ];
      setPanes(next);
    },
    [panes, setPanes],
  );

  const closePane = useCallback<StackCtx["closePane"]>(
    (index) => {
      if (panes.length <= 1) return; // first pane is the URL anchor; cannot close
      setPanes(panes.filter((_, i) => i !== index));
    },
    [panes, setPanes],
  );

  const paneIndexOf = useCallback<StackCtx["paneIndexOf"]>(
    (fqid) => panes.indexOf(fqid),
    [panes],
  );

  const value = useMemo<StackCtx>(
    () => ({ panes, pushPane, closePane, flashSignal, paneIndexOf }),
    [panes, pushPane, closePane, flashSignal, paneIndexOf],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStack() {
  return useContext(Ctx);
}

// Per-pane index for RefLink. A pane wraps its subtree with this so a clicked
// RefLink knows where it came from (and the new pane lands to its right).
const PaneIndexCtx = createContext<number | null>(null);

export function PaneIndexProvider({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return <PaneIndexCtx.Provider value={index}>{children}</PaneIndexCtx.Provider>;
}

export function usePaneIndex() {
  return useContext(PaneIndexCtx);
}
