/** Canvas geometry in local or page coordinates, independent of the editor and ink renderer. */
export type Point = { x: number; y: number };
export type Bounds = Point & { w: number; h: number };
export type Territory = { points: Point[]; label: Point };
/** Polygons with an exterior ring followed by optional holes. Rings may be open or closed. */
export type TerritoryRegion = Point[][][];
/** Local areas added to or carved from an automatic coast, independent of generated vertices. */
export type TerritoryEdit = { id: string; add: TerritoryRegion; cut: TerritoryRegion };
export type TerritoryPreferences = { edits: TerritoryEdit[]; legacy: Territory | null };

/** An empty region means no edit. A polygon needs rings that each span an area. */
export function validTerritoryRegion(region: TerritoryRegion): boolean {
  return region.every(polygon => polygon.length > 0 && polygon.every(ring => {
    if (ring.length < 3 || ring.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
    const a = ring[0], b = ring.find(p => p.x !== a.x || p.y !== a.y);
    return !!b && ring.some(p => (b.x - a.x) * (p.y - a.y) !== (b.y - a.y) * (p.x - a.x));
  }));
}
