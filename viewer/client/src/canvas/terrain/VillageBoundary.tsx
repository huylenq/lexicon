import type { ReactNode } from "react";
import type { Bounds } from "../../../../shared/canvas-geometry";
import { AtlasSprite } from "./VillageSprites";
import { pathFor, type District } from "./generate";
import sheet from "./assets/boundary-sprites.png";

const crops = [
  [10, 25, 300, 300], [338, 30, 264, 294], [628, 142, 298, 181], [943, 34, 292, 292],
  [8, 376, 304, 231], [323, 376, 299, 229], [624, 376, 300, 228], [930, 407, 310, 173],
  [16, 637, 289, 277], [321, 667, 300, 235], [629, 694, 299, 208], [941, 665, 293, 235],
  [20, 958, 292, 251], [356, 905, 242, 302], [650, 924, 245, 284], [951, 925, 285, 287],
] as const;

export function BoundarySprite({ crop, bounds, fallback }: { crop: number; bounds: Bounds; fallback: ReactNode }) {
  return <AtlasSprite kind={`boundary-${crop}`} bounds={bounds} crop={crops[crop]} source={sheet} fallback={fallback} />;
}

/** A small interior masonry crop repeats across the continuous wall geometry. */
export function MasonryTexture({ id }: { id: string }) {
  return <pattern id={id} width="26" height="18" patternUnits="userSpaceOnUse">
    <AtlasSprite kind="boundary-masonry" crop={[85, 1058, 52, 36]} source={sheet}
      bounds={{ x: 0, y: 0, w: 26, h: 18 }} fallback={null} />
  </pattern>;
}

export function VillageBoundary({ district }: { district: District }) {
  return <g className="village-boundary-scenery">
    {district.edge.kind !== "treeline" && district.edge.reaches.map(r =>
      <path key={r.id} d={pathFor(r.points)} className={`raster-edge-bed raster-edge-${district.edge.kind}`}
        style={{ strokeWidth: district.edge.kind === "cliff" ? 9 : 5 + r.depth * .35 }} />)}
    {[...district.edge.sprites].sort((a, b) => a.bounds.y + a.bounds.h - b.bounds.y - b.bounds.h || a.id.localeCompare(b.id)).map(s =>
      <g key={s.id} data-boundary-feature={district.edge.kind} data-boundary-sprite={s.id}
        transform={s.mirror ? `translate(${s.bounds.x * 2 + s.bounds.w} 0) scale(-1 1)` : undefined}>
        <BoundarySprite crop={s.crop} bounds={s.bounds} fallback={<ellipse data-boundary-fallback="true"
          cx={s.bounds.x + s.bounds.w / 2} cy={s.bounds.y + s.bounds.h - 5} rx={s.bounds.w / 2} ry="5" className="landscape-fallback" />} />
      </g>)}
  </g>;
}
