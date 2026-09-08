import { pathFor, type District } from "./generate";

export function TerrainBoundary({ district, fill }: {
  district: District; fill?: string;
}) {
  const d = pathFor(district.boundary, true), terrain = district.terrain;
  return <g className={`terrain-boundary terrain-boundary-${terrain}`} data-map-boundary={terrain}>
    {terrain === "island" && <>
      <path d={d} className="map-water-outer" />
      <path d={d} className="map-water" />
      <path d={d} className="boundary-ripple" />
    </>}
    <path d={d} className="boundary-shadow" transform="translate(0 3)" />
    <path d={d} className="boundary-bed" />
    <path d={d} className={`map-district map-district-${terrain}`} style={{ fill, stroke: "none" }} />
    <path d={d} className="boundary-rim" />
  </g>;
}
