import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EntityKind } from "./types";

// Single open inspector at a time. Lives at page level so the slab survives
// entity navigation — clicking a sibling in the rail re-targets in place.

export interface InspectorTarget {
  fqid: string;
  name: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  path: string;
  kind: EntityKind;
}

interface InspectorCtx {
  target: InspectorTarget | null;
  isOpen: boolean;
  spotlight: boolean; // true = dim non-target lines; false = full file readable
  setSpotlight: (v: boolean) => void;
  open: (t: InspectorTarget) => void;
  toggle: (t: InspectorTarget) => void;
  close: () => void;
}

const Ctx = createContext<InspectorCtx | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<InspectorTarget | null>(null);
  const [spotlight, setSpotlight] = useState(true);

  const open = useCallback((t: InspectorTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);
  const toggle = useCallback(
    (t: InspectorTarget) =>
      setTarget(prev => (prev?.fqid === t.fqid ? null : t)),
    [],
  );

  const value = useMemo<InspectorCtx>(
    () => ({
      target,
      isOpen: target !== null,
      spotlight,
      setSpotlight,
      open,
      toggle,
      close,
    }),
    [target, spotlight, open, toggle, close],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInspector() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInspector outside provider");
  return v;
}
