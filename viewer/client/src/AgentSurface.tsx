import { createContext, useCallback, useContext, useMemo, useRef, useState, type Context, type ReactNode } from "react";
import type { AgentDeltaSelection, AgentPoint, AgentSurface } from "./AgentWork";

type Geometry = {
  surface?: AgentSurface;
  setSurface: (surface: AgentSurface | undefined, owner?: HTMLElement) => void;
  locateDelta: (agentId: string, itemId: string, layer: AgentDeltaSelection["layer"]) => boolean;
  setDeltaLocations: (agentId: string, locations: Record<string, AgentPoint>) => void;
};
const GeometryContext: Context<Geometry | null> = import.meta.hot?.data.agentGeometryContext || createContext<Geometry | null>(null);
if (import.meta.hot) import.meta.hot.data.agentGeometryContext = GeometryContext;
export const useAgentSurface = () => useContext(GeometryContext);

/** Camera updates belong to the canvas surfaces, not every mounted conversation. */
export function AgentSurfaceProvider({ children, onSelection, onPresence }: {
  children: ReactNode; onSelection: (ids: string[]) => void; onPresence: (present: boolean) => void;
}) {
  const [surface, storeSurface] = useState<AgentSurface>();
  const current = useRef<AgentSurface>();
  const selection = useRef<string[]>([]);
  const locations = useRef<{ agentId: string; points: Record<string, AgentPoint> }>({ agentId: "", points: {} });
  const setSurface = useCallback((next: AgentSurface | undefined, owner?: HTMLElement) => {
    // A departing Planes effect can clean up after the next canvas has mounted.
    if (!next && owner && current.current?.host !== owner) return;
    if (!!current.current !== !!next) onPresence(!!next);
    const ids = next?.selectedIds || [];
    if (ids.length !== selection.current.length || ids.some((id, index) => id !== selection.current[index])) {
      selection.current = ids; onSelection(ids);
    }
    current.current = next; storeSurface(next);
  }, [onSelection, onPresence]);
  const setDeltaLocations = useCallback((agentId: string, points: Record<string, AgentPoint>) => { locations.current = { agentId, points }; }, []);
  const locateDelta = useCallback((agentId: string, itemId: string, layer: AgentDeltaSelection["layer"]) => {
    const point = locations.current.agentId === agentId ? locations.current.points[`${layer}:${itemId}`] : undefined;
    if (!point || !current.current) return false;
    current.current.locate(point); return true;
  }, []);
  const value = useMemo(() => ({ surface, setSurface, setDeltaLocations, locateDelta }), [surface, setSurface, setDeltaLocations, locateDelta]);
  return <GeometryContext.Provider value={value}>{children}</GeometryContext.Provider>;
}
