import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface Peek {
  id: string;
  file: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
  // The entity that pointed at this anchor — surfaced in the peek header.
  origin: { fqid: string; name: string };
}

interface PeekCtx {
  peeks: Peek[];
  open: (p: Omit<Peek, "id">) => void;
  close: (id: string) => void;
  closeAll: () => void;
}

const Ctx = createContext<PeekCtx | null>(null);

export function PeekProvider({ children }: { children: ReactNode }) {
  const [peeks, setPeeks] = useState<Peek[]>([]);
  const open = useCallback<PeekCtx["open"]>(p => {
    const id = `${p.file}:${p.lineStart ?? 0}-${p.lineEnd ?? 0}:${p.origin.fqid}`;
    setPeeks(prev => (prev.some(x => x.id === id) ? prev : [...prev, { ...p, id }]));
  }, []);
  const close = useCallback((id: string) => setPeeks(prev => prev.filter(x => x.id !== id)), []);
  const closeAll = useCallback(() => setPeeks([]), []);
  const value = useMemo(() => ({ peeks, open, close, closeAll }), [peeks, open, close, closeAll]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePeek() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePeek outside provider");
  return v;
}
